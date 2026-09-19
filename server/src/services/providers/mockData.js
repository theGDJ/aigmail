// Seed mailbox for the mock provider / demo account.
// Bodies deliberately contain signatures and quoted history so the cleaning
// pipeline (spec section 23) is exercised by the demo data too.
//
// `hoursAgo` is relative to "now" so the dashboard always shows recent mail.

const withSignature = (body, signature = 'Best regards,\nPriya Sharma\nProject Office') =>
  `${body}\n\nThanks,\n--\n${signature}`;

const withQuote = (body) =>
  `${body}\n\nOn Mon, 8 Sep at 09:12, Ravi Kumar <ravi.kumar@northwind-labs.com> wrote:\n> Can you send the updated numbers before the review?\n> Thanks.`;

export const MOCK_EMAILS = [
  {
    externalId: 'mock-001',
    sender: 'professor.menon@university.edu',
    senderName: 'Dr. Anitha Menon',
    subject: 'Final project report submission - Friday 5 PM',
    hoursAgo: 3,
    isRead: false,
    labels: ['INBOX', 'UNREAD', 'IMPORTANT', 'CATEGORY_UPDATES'],
    body: withSignature(
      `Dear students,

The final project report for CS4821 must be submitted by Friday 5 PM through the department portal. The report should include the updated architecture diagram, the evaluation section with your measured results, and a plagiarism declaration signed by every team member.

Please also prepare two questions on deployment for the review meeting on Monday at 10 AM, since the external examiner will focus on infrastructure decisions.

Late submissions will lose two marks per day, so plan accordingly.`,
      'Regards,\nDr. Anitha Menon\nDepartment of Computer Science',
    ),
  },
  {
    externalId: 'mock-002',
    sender: 'ravi.kumar@northwind-labs.com',
    senderName: 'Ravi Kumar',
    subject: 'Action required: client review deck by tomorrow 11 AM',
    hoursAgo: 6,
    isRead: false,
    labels: ['INBOX', 'UNREAD', 'IMPORTANT'],
    body: withQuote(
      `Hi,

The client moved our review forward to tomorrow 11 AM. Please update the deck with last quarter's numbers, add the new deployment diagram, and confirm the list of open risks before the call.

I need the final deck by tomorrow 9 AM at the latest so I can rehearse. Also, can you confirm whether the analytics pilot is still scoped for this sprint?`,
    ),
  },
  {
    externalId: 'mock-003',
    sender: 'billing@amazonpayments.example',
    senderName: 'Amazon Payments',
    subject: 'Your payment of Rs. 12,480 is due on 25 August',
    hoursAgo: 22,
    isRead: false,
    labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
    body: `Dear customer,

This is a reminder that your invoice INV-2026-4471 for Rs. 12,480 is due on 25 August. A late fee of 2% per month applies after the due date.

You can pay through the billing portal using your registered credit card. Please keep the transaction reference for your records.`,
  },
  {
    externalId: 'mock-004',
    sender: 'noreply@account-security-verify.example',
    senderName: 'Account Security',
    subject: 'URGENT: verify your account within 24 hours or it will be suspended',
    hoursAgo: 9,
    isRead: false,
    labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'],
    body: `Dear valued user,

Your account will be suspended within 24 hours because we detected unauthorised access. To restore access, confirm your username, password and the 16 digit card number at http://secure-verify-account.example/login within 24 hours.

Failure to act immediately will result in permanent deletion of your mailbox.`,
  },
  {
    externalId: 'mock-005',
    sender: 'hr@northwind-labs.com',
    senderName: 'People Team',
    subject: 'Leave balance and appraisal cycle timeline',
    hoursAgo: 30,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_UPDATES'],
    body: withSignature(
      `Hello,

A quick update on the appraisal cycle: self-assessment forms are open until 30 September, manager reviews happen in the first week of October, and letters go out by 20 October.

You have 6.5 days of leave remaining this year. Please submit any planned leave before the end of the quarter so the roster can be finalised.`,
      'Warmly,\nPeople Team',
    ),
  },
  {
    externalId: 'mock-006',
    sender: 'deals@techworldstore.example',
    senderName: 'TechWorld Store',
    subject: 'Your order #TW-88213 has shipped - arriving Thursday',
    hoursAgo: 40,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_PROMOTIONS'],
    body: `Hi there,

Good news - order #TW-88213 (mechanical keyboard, USB-C hub) has shipped and is arriving on Thursday. Track your parcel with the number in the delivery email.

As a thank you, use code TECH10 for 10% off your next purchase. Unsubscribe from these emails at any time.`,
  },
  {
    externalId: 'mock-007',
    sender: 'bookings@skyhigh-airlines.example',
    senderName: 'SkyHigh Airlines',
    subject: 'Itinerary: Chennai to Bengaluru on 12 October, 07:45',
    hoursAgo: 54,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_UPDATES'],
    body: `Dear passenger,

Your reservation SK-4471 is confirmed.

Flight: SH 218, Chennai (MAA) to Bengaluru (BLR)
Departure: 12 October, 07:45. Check-in closes 45 minutes before departure.
Hotel: Grand Meridian, booking ref GM-2291, check-in 12 October after 14:00.

Please carry a government photo ID and complete web check-in to choose your seat.`,
  },
  {
    externalId: 'mock-008',
    sender: 'invitations@linkedin.example',
    senderName: 'LinkedIn',
    subject: 'You have 4 new invitations and 12 profile views',
    hoursAgo: 62,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_SOCIAL'],
    body: `Hi,

You appeared in 12 searches this week and have 4 pending invitations, including two from people who work at Northwind Labs.

See who is viewing your profile and grow your network.`,
  },
  {
    externalId: 'mock-009',
    sender: 'mom.sharma@gmail.com',
    senderName: 'Mom',
    subject: 'Dinner on Sunday + your cousin is visiting',
    hoursAgo: 70,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_PERSONAL'],
    body: `Hi kanna,

Are you free for dinner on Sunday at 7 PM? Your cousin is visiting from Hyderabad and everyone wants to see you.

Bring the photos from the trip. Also let me know if you want me to make your favourite payasam.

Love,\nMom`,
  },
  {
    externalId: 'mock-010',
    sender: 'finance@northwind-labs.com',
    senderName: 'Finance Team',
    subject: 'Reimbursement claim pending approval - submit bills by 20 September',
    hoursAgo: 26,
    isRead: false,
    labels: ['INBOX', 'UNREAD'],
    body: withSignature(
      `Hello,

Your travel reimbursement claim for the client visit is pending approval because two bills are missing. Please upload the hotel invoice and the taxi receipt before 20 September.

Claims submitted after that date will be processed in the next cycle, which may delay payment to 15 October.`,
      'Finance Team\nNorthwind Labs',
    ),
  },
  {
    externalId: 'mock-011',
    sender: 'no-reply@github.com',
    senderName: 'GitHub',
    subject: '[northwind/ai-mail-summarizer] CI failed on main',
    hoursAgo: 12,
    isRead: false,
    labels: ['INBOX', 'UNREAD'],
    body: `Workflow "ci" failed on main at commit 4f9c1ab.

Failing job: test (node 20) - 2 tests failed in server/src/services/__tests__/emailParser.test.js.

Review the logs for details. You can re-run the failed jobs from the Actions tab.`,
  },
  {
    externalId: 'mock-012',
    sender: 'digest@productnews.example',
    senderName: 'Product Weekly',
    subject: 'This week in AI: 5 things that matter',
    hoursAgo: 34,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_PROMOTIONS'],
    body: `Your weekly round-up of AI news.

1. Smaller models are getting better at structured extraction.
2. Evaluation of summarisation quality is still mostly human.
3. Gmail API quotas changed for high-volume apps.
4. Voice interfaces moved from novelty to default.
5. Open datasets for email understanding are still rare.

Read the full version online. Unsubscribe at any time.`,
  },
  {
    externalId: 'mock-013',
    sender: 'interview.scheduling@brightlabs.example',
    senderName: 'Talent Team',
    subject: 'Interview panel confirmation - please confirm your slot',
    hoursAgo: 18,
    isRead: false,
    labels: ['INBOX', 'UNREAD', 'IMPORTANT'],
    body: `Hi,

Thanks for your interest in the Backend Engineer role. We would like to schedule a 45 minute technical panel on Tuesday at 4 PM IST.

Please confirm the slot by replying to this email, and share any accessibility requirements. If the time does not work, suggest two alternatives before Friday.`,
  },
  {
    externalId: 'mock-014',
    sender: 'library@university.edu',
    senderName: 'University Library',
    subject: 'Overdue book reminder - record of achievement on your account',
    hoursAgo: 44,
    isRead: true,
    labels: ['INBOX'],
    body: `The book "Designing Data-Intensive Applications" borrowed on 4 August is overdue. A fine of Rs. 10 per day is accruing.

Return the book at the central library counter to clear your account. Renewals are possible once if no other student has reserved the copy.`,
  },
  {
    externalId: 'mock-015',
    sender: 'security@bank.example',
    senderName: 'NeoBank Alerts',
    subject: 'Transaction alert: Rs. 2,499 debited from your account',
    hoursAgo: 8,
    isRead: false,
    labels: ['INBOX', 'UNREAD', 'IMPORTANT'],
    body: `A transaction of Rs. 2,499 was made on your NeoBank card ending 4471 at TECHWORLD STORE on 18 September at 14:02.

If you did not make this transaction, block your card from the app immediately and contact us on the number on the back of your card.`,
  },
  {
    externalId: 'mock-016',
    sender: 'team@hacknight.example',
    senderName: 'HackNight',
    subject: 'You are invited: 36-hour hackathon on 27 September',
    hoursAgo: 58,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_SOCIAL'],
    body: `Registration for HackNight 4.0 is open. The event runs from 27 September 9 AM to 28 September 9 PM at the innovation centre.

Teams of up to four. Themes include applied AI, developer tooling, and civic tech. Register your team by 24 September to reserve seats and swag.`,
  },
  {
    externalId: 'mock-017',
    sender: 'priya.nair@northwind-labs.com',
    senderName: 'Priya Nair',
    subject: 'Notes from the architecture review',
    hoursAgo: 20,
    isRead: true,
    labels: ['INBOX'],
    body: `Sharing the notes from today's review since you missed it.

The team approved the provider interface for email sources. Two follow-ups for you: document the token refresh flow, and add a fallback when the AI provider times out. We also agreed to keep prompts in one module instead of inlining them in routes.

No action needed this week beyond those two items - nice work on the sync pipeline.`,
  },
  {
    externalId: 'mock-018',
    sender: 'events@citybooks.example',
    senderName: 'City Books',
    subject: 'Your pre-order is ready for pickup',
    hoursAgo: 66,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_UPDATES'],
    body: `The book you pre-ordered, "Streaming Systems", has arrived at the Anna Nagar branch.

Please collect it within 7 days. Bring your order confirmation. After 7 days the copy is returned to the shelf and your pre-order is cancelled.`,
  },
  {
    externalId: 'mock-019',
    sender: 'coach@gym.example',
    senderName: 'FitLife Studio',
    subject: 'Membership renews on 1 October - update payment method',
    hoursAgo: 28,
    isRead: true,
    labels: ['INBOX'],
    body: `Your quarterly membership renews on 1 October. The card we have on file expires this month, so please update the payment method in the app before 30 September to avoid losing your session slots.

Reply to this email if you would rather pause the membership instead of renewing.`,
  },
  {
    externalId: 'mock-020',
    sender: 'no-reply@notifications.example',
    senderName: 'StreamBox',
    subject: 'New episode available in your watchlist',
    hoursAgo: 14,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_PROMOTIONS'],
    body: `A new episode of your watchlisted show is available now.

Continue watching where you left off. Upgrade to the annual plan to save 25 percent. Unsubscribe from watchlist notifications in settings.`,
  },
  {
    externalId: 'mock-021',
    sender: 'admin@university.edu',
    senderName: 'Examination Cell',
    subject: 'Hall ticket for end semester examinations released',
    hoursAgo: 72,
    isRead: true,
    labels: ['INBOX'],
    body: `Hall tickets for the end semester examinations are now available on the student portal.

Check your photograph, subject codes and centre carefully. Report discrepancies to the exam cell before 25 September. Carry a printed hall ticket and ID to every exam.`,
  },
  {
    externalId: 'mock-022',
    sender: 'sanjay.rao@northwind-labs.com',
    senderName: 'Sanjay Rao',
    subject: 'Question about the AI summariser roadmap',
    hoursAgo: 5,
    isRead: false,
    labels: ['INBOX', 'UNREAD'],
    body: `Quick question before the planning meeting.

Do you think we can add Outlook support in the same sprint, or should we keep it behind the provider interface and ship Gmail only this quarter? Also, has the team decided whether daily digests are email, in-app, or both?

A short reply is enough - I just need your recommendation for the deck.`,
  },
  {
    externalId: 'mock-023',
    sender: 'support@traveldeals.example',
    senderName: 'TravelDeals',
    subject: 'Limited time: flights to Goa from Rs. 2,199',
    hoursAgo: 36,
    isRead: true,
    labels: ['INBOX', 'CATEGORY_PROMOTIONS'],
    body: `Flash sale on flights to Goa for travel between 10 October and 20 November.

Fares start at Rs. 2,199 one way including taxes. Book before midnight on Friday. Limited seats. Unsubscribe from promotional emails.`,
  },
  {
    externalId: 'mock-024',
    sender: 'accounts@electricityboard.example',
    senderName: 'State Electricity Board',
    subject: 'Electricity bill for September - pay before 28 September',
    hoursAgo: 16,
    isRead: false,
    labels: ['INBOX', 'UNREAD'],
    body: `Your electricity bill for the September cycle is Rs. 1,842 for consumer number 99802-4471.

The last date for payment without penalty is 28 September. Pay online through the board portal or at any authorised collection centre.`,
  },
];

/** Turns the templates above into dated records relative to `now`. */
export const buildMockEmails = (now = new Date()) =>
  MOCK_EMAILS.map((tpl) => ({
    externalId: tpl.externalId,
    threadId: tpl.threadId || tpl.externalId,
    sender: tpl.sender,
    senderName: tpl.senderName,
    recipient: 'demo.user@gmail.com',
    subject: tpl.subject,
    body: tpl.body,
    snippet: tpl.body.replace(/\s+/g, ' ').slice(0, 160),
    receivedAt: new Date(now.getTime() - tpl.hoursAgo * 60 * 60 * 1000),
    isRead: tpl.isRead,
    isStarred: false,
    labels: tpl.labels,
    hasAttachments: /attach/i.test(tpl.body),
  }));

export default { MOCK_EMAILS, buildMockEmails };
