/**
 * Domain knowledge for every supported celebration type.
 *
 * - `budgetWeights` are relative shares (they are normalised at runtime).
 * - `perGuestInr` is the typical spend per guest in INR used to classify a
 *   budget as lean / comfortable / premium.
 * - `vendors[].bookByDays` / `milestones[].daysBefore` are ideal lead times
 *   (days before the event). They are compressed when the user has less time.
 */

export const BUDGET_CATEGORIES = Object.freeze({
  venue: 'Venue',
  catering: 'Food & beverages',
  decor: 'Decor & flowers',
  photography: 'Photo & video',
  entertainment: 'Music & entertainment',
  attire: 'Attire & styling',
  invitations: 'Invitations & stationery',
  favors: 'Gifts & return favours',
  logistics: 'Transport & logistics',
  permits: 'Permits, safety & insurance',
  contingency: 'Contingency buffer',
});

/** Approximate static conversion rates to INR (documented assumption). */
export const CURRENCY_TO_INR = Object.freeze({
  INR: 1,
  USD: 84,
  EUR: 91,
  GBP: 107,
  AED: 23,
});

/** Categories a user can mark as a priority to receive a larger share. */
export const PRIORITY_OPTIONS = Object.freeze([
  'venue',
  'catering',
  'decor',
  'photography',
  'entertainment',
  'attire',
]);

export const EVENT_TEMPLATES = Object.freeze({
  wedding: {
    label: 'Wedding',
    idealLeadDays: 270,
    perGuestInr: { lean: 1200, premium: 4000 },
    budgetWeights: {
      venue: 22,
      catering: 30,
      decor: 12,
      photography: 10,
      entertainment: 6,
      attire: 8,
      invitations: 2,
      favors: 3,
      logistics: 3,
      contingency: 8,
    },
    vendors: [
      {
        category: 'venue',
        name: 'Venue / banquet hall',
        bookByDays: 240,
        questions: [
          'Is the date available for all ceremonies and what is the rain backup?',
          'What is included (seating, power backup, parking, changing rooms)?',
          'What are the cancellation, overtime and outside-caterer policies?',
        ],
      },
      {
        category: 'catering',
        name: 'Caterer',
        bookByDays: 180,
        questions: [
          'Can we schedule a tasting and customise the menu for dietary needs?',
          'What is the per-plate price and minimum guarantee?',
          'How many service staff per 50 guests are included?',
        ],
      },
      {
        category: 'photography',
        name: 'Photographer & videographer',
        bookByDays: 180,
        questions: [
          'Can we see two complete wedding galleries, not just highlights?',
          'How many hours, shooters and edited photos are included?',
          'What is the delivery timeline for photos and the film?',
        ],
      },
      {
        category: 'decor',
        name: 'Decorator & florist',
        bookByDays: 120,
        questions: [
          'Can you share a mood board and itemised quote for our theme?',
          'Which flowers are in season on our date?',
          'Who handles setup and teardown, and at what times?',
        ],
      },
      {
        category: 'entertainment',
        name: 'DJ / live band',
        bookByDays: 120,
        questions: [
          'Do you bring sound, lights and a backup system?',
          'Can we share a must-play and do-not-play list?',
          'Are there venue sound curfews you have worked with?',
        ],
      },
      {
        category: 'attire',
        name: 'Outfits, makeup & mehendi artist',
        bookByDays: 90,
        questions: [
          'How many fittings or trials are included?',
          'Do you travel to the venue and what is the call time?',
          'What products do you use for sensitive skin?',
        ],
      },
      {
        category: 'invitations',
        name: 'Invitation designer / e-invites',
        bookByDays: 75,
        questions: [
          'Can you provide digital and printed versions?',
          'How many revisions are included?',
          'What is the print and delivery turnaround?',
        ],
      },
      {
        category: 'logistics',
        name: 'Guest transport & accommodation',
        bookByDays: 60,
        questions: [
          'Can you hold a block of rooms at a group rate?',
          'Do you provide airport/station pickups for out-of-town guests?',
          'What is the vehicle count and driver schedule?',
        ],
      },
    ],
    milestones: [
      { daysBefore: 270, phase: 'Foundation', title: 'Agree on budget, guest list size and date shortlist' },
      { daysBefore: 240, phase: 'Foundation', title: 'Visit and book the venue' },
      { daysBefore: 180, phase: 'Bookings', title: 'Book caterer, photographer and videographer' },
      { daysBefore: 120, phase: 'Bookings', title: 'Finalise decor theme and book decorator, DJ/band' },
      { daysBefore: 90, phase: 'Bookings', title: 'Order outfits and book makeup & mehendi artists' },
      { daysBefore: 75, phase: 'Details', title: 'Send save-the-dates and finalise guest list' },
      { daysBefore: 45, phase: 'Details', title: 'Send invitations and arrange guest travel & stay' },
      { daysBefore: 30, phase: 'Details', title: 'Menu tasting, ceremony run-sheet and seating plan' },
      { daysBefore: 14, phase: 'Final stretch', title: 'Confirm RSVPs and share final headcount with caterer' },
      { daysBefore: 7, phase: 'Final stretch', title: 'Reconfirm every vendor, prepare payments and emergency kit' },
      { daysBefore: 1, phase: 'Final stretch', title: 'Rehearsal, decor walkthrough and hand over run-sheet' },
      { daysBefore: 0, phase: 'Event day', title: 'Celebrate! Point person manages vendors and timing' },
    ],
  },

  birthday: {
    label: 'Birthday party',
    idealLeadDays: 45,
    perGuestInr: { lean: 400, premium: 1800 },
    budgetWeights: {
      venue: 18,
      catering: 34,
      decor: 14,
      photography: 6,
      entertainment: 14,
      invitations: 2,
      favors: 4,
      contingency: 8,
    },
    vendors: [
      {
        category: 'venue',
        name: 'Venue / party space',
        bookByDays: 35,
        questions: [
          'Is there a minimum spend or time slot limit?',
          'Can we bring our own cake and decorations?',
          'Is the space accessible and child-safe if needed?',
        ],
      },
      {
        category: 'catering',
        name: 'Caterer & cake baker',
        bookByDays: 21,
        questions: [
          'Can you label allergens and offer vegetarian/vegan options?',
          'What is the lead time for a custom cake design?',
          'Do you deliver and set up?',
        ],
      },
      {
        category: 'entertainment',
        name: 'Entertainment (DJ, magician, games host)',
        bookByDays: 21,
        questions: [
          'What age group is your act designed for?',
          'How long is the set and what space do you need?',
          'Do you bring your own equipment?',
        ],
      },
      {
        category: 'decor',
        name: 'Decor & balloon artist',
        bookByDays: 14,
        questions: [
          'Can you match our theme colours?',
          'How early do you need venue access?',
          'Are your balloons and materials eco-friendly?',
        ],
      },
      {
        category: 'photography',
        name: 'Photographer / photo booth',
        bookByDays: 14,
        questions: [
          'Do you offer instant prints or a digital booth?',
          'How many edited photos are included?',
          'When will we receive the gallery?',
        ],
      },
    ],
    milestones: [
      { daysBefore: 45, phase: 'Foundation', title: 'Pick theme, budget and guest list' },
      { daysBefore: 35, phase: 'Foundation', title: 'Book the venue (or prepare the home space)' },
      { daysBefore: 28, phase: 'Bookings', title: 'Send invitations with RSVP date' },
      { daysBefore: 21, phase: 'Bookings', title: 'Book caterer, cake and entertainment' },
      { daysBefore: 14, phase: 'Details', title: 'Order decor, return favours and outfit' },
      { daysBefore: 7, phase: 'Details', title: 'Confirm RSVPs, plan games and party timeline' },
      { daysBefore: 2, phase: 'Final stretch', title: 'Confirm deliveries and prepare a playlist' },
      { daysBefore: 0, phase: 'Event day', title: 'Set up, celebrate and capture memories' },
    ],
  },

  anniversary: {
    label: 'Anniversary celebration',
    idealLeadDays: 60,
    perGuestInr: { lean: 600, premium: 2500 },
    budgetWeights: {
      venue: 24,
      catering: 32,
      decor: 12,
      photography: 9,
      entertainment: 9,
      invitations: 2,
      favors: 4,
      contingency: 8,
    },
    vendors: [
      {
        category: 'venue',
        name: 'Restaurant / venue',
        bookByDays: 45,
        questions: [
          'Do you have a private area for our group size?',
          'Can we customise the menu and bring a cake?',
          'Is there parking and step-free access for elders?',
        ],
      },
      {
        category: 'catering',
        name: 'Caterer / set menu',
        bookByDays: 30,
        questions: [
          'Can we recreate a dish that is meaningful to the couple?',
          'What is the per-head price including taxes?',
          'Are soft-food options available for elderly guests?',
        ],
      },
      {
        category: 'photography',
        name: 'Photographer',
        bookByDays: 30,
        questions: [
          'Can you include a short couple portrait session?',
          'Do you offer a printed album?',
          'What is the turnaround time?',
        ],
      },
      {
        category: 'entertainment',
        name: 'Live music / singer',
        bookByDays: 21,
        questions: [
          'Can you perform the couple’s favourite songs from their era?',
          'What sound setup do you need?',
          'How long is each set?',
        ],
      },
    ],
    milestones: [
      { daysBefore: 60, phase: 'Foundation', title: 'Decide format (surprise or planned), budget and guest list' },
      { daysBefore: 45, phase: 'Foundation', title: 'Book the venue or restaurant' },
      { daysBefore: 30, phase: 'Bookings', title: 'Book photographer and caterer; send invites' },
      { daysBefore: 21, phase: 'Bookings', title: 'Book music and collect old photos for a memory wall' },
      { daysBefore: 10, phase: 'Details', title: 'Gather messages from family for a tribute video' },
      { daysBefore: 3, phase: 'Final stretch', title: 'Confirm headcount, decor and cake' },
      { daysBefore: 0, phase: 'Event day', title: 'Celebrate the couple and play the tribute' },
    ],
  },

  baby_shower: {
    label: 'Baby shower / godh bharai',
    idealLeadDays: 45,
    perGuestInr: { lean: 450, premium: 1800 },
    budgetWeights: {
      venue: 18,
      catering: 34,
      decor: 16,
      photography: 8,
      entertainment: 8,
      invitations: 3,
      favors: 5,
      contingency: 8,
    },
    vendors: [
      {
        category: 'venue',
        name: 'Venue / home setup',
        bookByDays: 30,
        questions: [
          'Is there comfortable seating and a rest area for the parent-to-be?',
          'Is the venue on the ground floor or has a lift?',
          'Are there quiet hours or noise limits?',
        ],
      },
      {
        category: 'catering',
        name: 'Caterer',
        bookByDays: 21,
        questions: [
          'Can you prepare pregnancy-safe dishes (no raw/undercooked items)?',
          'Do you offer traditional sweets for the ceremony?',
          'Can you label allergens?',
        ],
      },
      {
        category: 'decor',
        name: 'Decorator',
        bookByDays: 14,
        questions: [
          'Can you do a gender-neutral or traditional theme?',
          'Do you use non-toxic, fragrance-free materials?',
          'How long does setup take?',
        ],
      },
    ],
    milestones: [
      { daysBefore: 45, phase: 'Foundation', title: 'Agree on date with the parents-to-be, budget and guest list' },
      { daysBefore: 30, phase: 'Foundation', title: 'Book the venue and send invitations' },
      { daysBefore: 21, phase: 'Bookings', title: 'Book caterer and plan ceremony rituals or games' },
      { daysBefore: 14, phase: 'Details', title: 'Order decor, favours and set up a gift registry' },
      { daysBefore: 5, phase: 'Final stretch', title: 'Confirm RSVPs and arrange comfortable seating' },
      { daysBefore: 0, phase: 'Event day', title: 'Host a relaxed, comfortable celebration' },
    ],
  },

  community: {
    label: 'Community event / festival',
    idealLeadDays: 90,
    perGuestInr: { lean: 150, premium: 800 },
    budgetWeights: {
      venue: 16,
      catering: 24,
      decor: 10,
      photography: 4,
      entertainment: 14,
      invitations: 6,
      logistics: 8,
      permits: 10,
      contingency: 8,
    },
    vendors: [
      {
        category: 'permits',
        name: 'Local authority permissions (police, municipality, fire)',
        bookByDays: 60,
        questions: [
          'Which permits are required for our expected crowd size?',
          'Is a loudspeaker or late-night permission needed?',
          'What fire-safety and first-aid provisions are mandatory?',
        ],
      },
      {
        category: 'venue',
        name: 'Ground / community hall',
        bookByDays: 75,
        questions: [
          'What is the maximum safe capacity and the number of exits?',
          'Are toilets, drinking water and power available?',
          'What is the cleaning and waste-disposal arrangement?',
        ],
      },
      {
        category: 'entertainment',
        name: 'Sound, stage & performers',
        bookByDays: 45,
        questions: [
          'Can you provide a stage, sound and lighting package?',
          'Do you have public-event experience and insurance?',
          'What is the setup time and power requirement?',
        ],
      },
      {
        category: 'catering',
        name: 'Food stalls / bulk caterer',
        bookByDays: 30,
        questions: [
          'Do you hold a valid food-safety licence?',
          'Can you serve at the expected peak rate?',
          'How will you manage waste and use eco-friendly serveware?',
        ],
      },
      {
        category: 'logistics',
        name: 'Security, volunteers & crowd management',
        bookByDays: 21,
        questions: [
          'How many staff are needed for our crowd size?',
          'Who coordinates lost-and-found and first aid?',
          'Is there a clear radio/phone chain of command?',
        ],
      },
    ],
    milestones: [
      { daysBefore: 90, phase: 'Foundation', title: 'Form an organising committee and set goals & budget' },
      { daysBefore: 75, phase: 'Foundation', title: 'Book the ground or hall and identify sponsors' },
      { daysBefore: 60, phase: 'Bookings', title: 'Apply for permits (police, municipality, fire safety)' },
      { daysBefore: 45, phase: 'Bookings', title: 'Book stage, sound, performers and food stalls' },
      { daysBefore: 30, phase: 'Details', title: 'Launch promotion on social media and local groups' },
      { daysBefore: 21, phase: 'Details', title: 'Recruit and brief volunteers; plan crowd flow' },
      { daysBefore: 7, phase: 'Final stretch', title: 'Site walkthrough, safety check and vendor confirmations' },
      { daysBefore: 1, phase: 'Final stretch', title: 'Setup, signage, first-aid desk and volunteer briefing' },
      { daysBefore: 0, phase: 'Event day', title: 'Run the event and track crowd and safety' },
      { daysBefore: -2, phase: 'After', title: 'Clean up, settle accounts and thank sponsors' },
    ],
  },
});

export const EVENT_TYPES = Object.freeze(Object.keys(EVENT_TEMPLATES));

export const VENUE_TYPES = Object.freeze(['undecided', 'home', 'banquet', 'outdoor', 'restaurant', 'community']);
