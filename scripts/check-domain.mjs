// Domain readiness checker.
//
// Reads PUBLIC registry (RDAP) and DNS data only — no GoDaddy login, no API
// key, nothing sensitive leaves this machine except the domain name itself.
//
//   node scripts/check-domain.mjs                      # checks the defaults
//   node scripts/check-domain.mjs yourdomain.com ...   # checks what you name
//
// For each domain it reports: whether it is registered, who the registrar is,
// which nameservers are authoritative (this is what tells us whether GoDaddy
// or someone else is actually serving DNS), and which records already exist.

const DEFAULT_CANDIDATES = [
  'mountolympusdetailing.com',
  'mountolympusdetailing.net',
  'mtolympusdetailing.com',
  'mountolympusdetail.com',
  'olympusdetailing.com',
];

const domains = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_CANDIDATES;

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/** Public RDAP lookup — the modern replacement for WHOIS. */
async function rdap(domain) {
  const tld = domain.split('.').pop();
  const endpoints = {
    com: 'https://rdap.verisign.com/com/v1/domain/',
    net: 'https://rdap.verisign.com/net/v1/domain/',
  };
  const base = endpoints[tld] ?? `https://rdap.org/domain/`;
  try {
    const res = await fetch(base + domain, { headers: { Accept: 'application/rdap+json' } });
    if (res.status === 404) return { registered: false };
    if (!res.ok) return { error: `RDAP ${res.status}` };
    const data = await res.json();

    const registrar =
      data.entities?.find((e) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find(
        (f) => f[0] === 'fn'
      )?.[3] ?? 'unknown';

    const created = data.events?.find((e) => e.eventAction === 'registration')?.eventDate;
    const expires = data.events?.find((e) => e.eventAction === 'expiration')?.eventDate;

    return {
      registered: true,
      registrar,
      created: created?.slice(0, 10),
      expires: expires?.slice(0, 10),
      nameservers: (data.nameservers ?? []).map((n) => n.ldhName?.toLowerCase()).filter(Boolean),
    };
  } catch (e) {
    return { error: e.message };
  }
}

/** DNS over HTTPS — no local resolver quirks. */
async function dns(name, type) {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${name}&type=${type}`, {
      headers: { Accept: 'application/dns-json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.Answer ?? []).filter((a) => a.type !== 5 || type === 'CNAME').map((a) => a.data);
  } catch {
    return [];
  }
}

console.log(`\n${bold('Domain readiness check')}  ${dim('(public registry + DNS only)')}\n`);

let anyRegistered = false;

for (const domain of domains) {
  const info = await rdap(domain);

  if (info.error) {
    console.log(`${bold(domain)}\n  ${yellow('?')} lookup failed: ${info.error}\n`);
    continue;
  }

  if (!info.registered) {
    console.log(`${bold(domain)}\n  ${dim('available / not registered')}\n`);
    continue;
  }

  anyRegistered = true;
  const ns = info.nameservers ?? [];
  const onGoDaddy = ns.some((n) => /domaincontrol\.com$/.test(n));
  const registrarIsGoDaddy = /godaddy/i.test(info.registrar);

  console.log(`${bold(domain)}  ${green('REGISTERED')}`);
  console.log(`  registrar    ${info.registrar}${registrarIsGoDaddy ? green('  ← GoDaddy') : ''}`);
  console.log(`  registered   ${info.created ?? '—'}`);
  console.log(`  expires      ${info.expires ?? '—'}`);
  console.log(`  nameservers  ${ns.length ? ns.join(', ') : '—'}`);
  console.log(
    `  DNS hosted   ${
      onGoDaddy
        ? green('GoDaddy (domaincontrol.com) — add records in GoDaddy DNS')
        : yellow('NOT GoDaddy — add records wherever these nameservers live')
    }`
  );

  const [a, aaaa, cname, mx, txt] = await Promise.all([
    dns(domain, 'A'),
    dns(domain, 'AAAA'),
    dns(`www.${domain}`, 'CNAME'),
    dns(domain, 'MX'),
    dns(domain, 'TXT'),
  ]);

  console.log(`  A            ${a.length ? a.join(', ') : dim('none — domain does not point anywhere yet')}`);
  if (aaaa.length) console.log(`  AAAA         ${aaaa.join(', ')}`);
  console.log(`  www CNAME    ${cname.length ? cname.join(', ') : dim('none')}`);
  console.log(`  MX           ${mx.length ? mx.join(' | ') : dim('none — no email receiving')}`);

  const spf = txt.filter((t) => /v=spf1/i.test(t));
  const dmarcRecs = await dns(`_dmarc.${domain}`, 'TXT');
  const resendDkim = await dns(`resend._domainkey.${domain}`, 'TXT');

  console.log(`  SPF          ${spf.length ? spf.join(' ') : dim('none')}`);
  console.log(`  DMARC        ${dmarcRecs.length ? dmarcRecs.join(' ') : dim('none')}`);
  console.log(
    `  Resend DKIM  ${
      resendDkim.length ? green('present') : dim('none — customer email cannot send until this exists')
    }`
  );
  console.log('');
}

if (!anyRegistered) {
  console.log(
    `${yellow('No registered domain found among the names checked.')}\n` +
      `Re-run with your actual domain:  node scripts/check-domain.mjs yourdomain.com\n`
  );
}
