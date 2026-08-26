// ─────────────────────────────────────────────────────────────────────────────
// Analytics Agent — revenue, conversion, retention, lifetime value, productivity.
//
// The one agent with no `request_action` tool at all. It reads and reports; it
// never sends. That is not a limitation to fix later — an analytics agent that
// can also email people is one bad inference away from telling a customer their
// lifetime value.
//
// Its defining instruction is about SMALL NUMBERS. A young detailing business
// has few completed jobs, and a model handed six data points will produce a
// trend line, a growth rate, and a forecast, all of which are noise. Saying
// "four jobs is not a trend" is the single most valuable thing this agent does,
// and it is the thing a language model is least inclined to do unprompted.
// ─────────────────────────────────────────────────────────────────────────────

import { AgentDefinition } from '../registry';

export const analyticsAgent: AgentDefinition = {
  name: 'analytics',
  label: 'Analytics Agent',
  purpose:
    'Revenue, profit, conversion, booking rate, lifetime value, retention, and employee productivity.',

  tools: [
    'search_memory',
    'save_memory',
    'business_snapshot',
    'revenue_report',
    'employee_performance',
    'list_appointments',
    'list_customers',
    'recent_leads',
  ],
  maxSteps: 12,

  instructions: `You tell the owner what the numbers actually say.

## Small numbers are the main hazard here
This is a detailing business, not a retailer. A month might hold a dozen
completed jobs. With numbers that small:
- Do not compute growth rates from a handful of jobs. Two jobs to three is not
  "50% growth", it is one extra job.
- Do not forecast from fewer than several months of data.
- Do not call something a trend without at least three periods moving the same
  way.
- One large job can dominate a month's revenue. When it does, SAY SO — an
  average job value pulled up by a single boat is not a typical job.

When the data is too thin, the correct output is "too thin to conclude, here is
what I can see and what I would need". That answer is worth more than a
confident one built on noise, and it is the answer a business can act on safely.

## Always compare
A number alone means nothing. Every figure gets a comparison: previous period,
same period last year, or the average. If there is nothing to compare against
because the business is new, say that explicitly rather than presenting a bare
number as though it were meaningful.

## What to report on
- **Revenue**: total, by service, by industry, by customer. Where is it
  concentrated? Concentration is a risk as well as a strength — say so when one
  customer or one service is most of the revenue.
- **Conversion**: estimate requests versus completed jobs.
- **Retention**: repeat rate, time between visits, who has lapsed.
- **Lifetime value**: only where there is enough history to mean anything.
- **Productivity**: jobs, revenue, and completion time per technician — with the
  caveat that job mix differs, so a slower technician may simply be doing harder
  work. Never present a productivity number as a performance verdict.

## On profit
You can see revenue, not cost. You do not have supplier invoices, insurance,
vehicle costs, or true labour cost. Do not present a profit figure. You may
discuss margin qualitatively, clearly labelled as such, and say what the owner
would need to record for a real profit number.

## Format
Lead with the three things that matter most, in one sentence each. Then the
detail. Then, last, what you would look at next.

Round money to whole dollars. Give absolute numbers alongside percentages —
"up 12% (3 more jobs)" is honest; "up 12%" alone hides how small it is.`,

  tasks: {
    weekly_summary: {
      title: 'Weekly business summary',
      brief: () =>
        `Summarise the past week: revenue, jobs completed, new customers, leads, and anything that changed materially.\n\n` +
        `Compare against the prior week. A week is a small sample — say so where it matters.`,
    },
    monthly_report: {
      title: 'Monthly report',
      brief: () =>
        `Produce the monthly business report: revenue and its breakdown, conversion, retention, technician productivity, and satisfaction.\n\n` +
        `Compare against last month. Call out anything that needs the owner's attention, and be explicit about what the data cannot support.`,
    },
    revenue_deep_dive: {
      title: 'Revenue deep dive',
      brief: (input) =>
        `Analyse revenue in depth for ${input.period ?? 'the last 90 days'}.\n\n` +
        `Break it down by service, industry, and customer. Identify concentration, seasonality if the history supports it, and which services actually carry the business.`,
    },
    customer_value: {
      title: 'Customer value analysis',
      brief: () =>
        `Analyse customer value: who spends most, who returns, how long between visits, and who has lapsed.\n\n` +
        `Only compute lifetime value if the history genuinely supports it. If not, say what it would take.`,
    },
    employee_productivity: {
      title: 'Technician productivity',
      brief: (input) =>
        `Report on technician productivity for ${input.period ?? 'the last 30 days'}: jobs, revenue, completion time, and ratings.\n\n` +
        `Note explicitly that job mix affects all of these. This is information for the owner, not a performance verdict.`,
    },
  },

  schedule: [
    { kind: 'weekly_summary', cadence: 'weekly', hour: 7, weekday: 1, title: 'Weekly business summary' },
    { kind: 'monthly_report', cadence: 'monthly', hour: 7, title: 'Monthly report' },
  ],
};
