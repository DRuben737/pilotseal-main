import type { Metadata } from "next";

export type GuideSlug =
  | "student-solo"
  | "knowledge-test"
  | "practical-test"
  | "flight-review-currency"
  | "high-performance-complex"
  | "tailwheel"
  | "instrument-proficiency"
  | "additional-category-class"
  | "solo-cross-country"
  | "multi-engine"
  | "spin-training"
  | "instrument-knowledge-test"
  | "commercial-knowledge-test";

export type GuideCard = {
  title: string;
  desc: string;
};

export type GuideFaq = {
  q: string;
  a: string;
};

export type GuideReference = {
  title: string;
  note: string;
};

export type GuideSection =
  | {
      kind: "text";
      title: string;
      paragraphs: string[];
    }
  | {
      kind: "checklist";
      title: string;
      items: string[];
    }
  | {
      kind: "bullet";
      title: string;
      intro?: string;
      items: string[];
      outro?: string;
    }
  | {
      kind: "cards";
      title: string;
      intro?: string;
      items: GuideCard[];
    };

export type EndorsementGuide = {
  slug: GuideSlug;
  metadata: Metadata;
  breadcrumb: string;
  title: string;
  heroDescription: string;
  sections: GuideSection[];
  ctaTitle?: string;
  ctaDescription: string;
  references?: GuideReference[];
  faqs?: GuideFaq[];
  relatedGuideSlugs?: GuideSlug[];
};

export const defaultGuideReferences: GuideReference[] = [
  {
    title: "FAR Part 61",
    note: "Core pilot certification and endorsement requirements live here, so it is the baseline reference for scope, eligibility, and authorization.",
  },
  {
    title: "AC 61-65",
    note: "Use this as the primary endorsement wording reference when you need examples and FAA-endorsed phrasing structure.",
  },
  {
    title: "AC 61-98",
    note: "Useful when the scenario overlaps with flight reviews, currency, or other recurrent training and proficiency contexts.",
  },
];

export const guideCards: Record<
  GuideSlug,
  { title: string; desc: string; href: `/endorsements/${GuideSlug}` }
> = {
  "student-solo": {
    title: "Student Solo Endorsements",
    desc: "Clarity, aircraft scope, and recordkeeping consistency for student solo authorizations.",
    href: "/endorsements/student-solo",
  },
  "knowledge-test": {
    title: "Knowledge Test Endorsements",
    desc: "Structure and scope knowledge-test authorizations clearly and consistently.",
    href: "/endorsements/knowledge-test",
  },
  "practical-test": {
    title: "Practical Test (Checkride) Endorsements",
    desc: "Explicit, verifiable checkride endorsements aligned with training records and scope.",
    href: "/endorsements/practical-test",
  },
  "flight-review-currency": {
    title: "Flight Review & Currency Endorsements",
    desc: "Document flight reviews, recurrent training, and scope-specific signoffs with clearer records.",
    href: "/endorsements/flight-review-currency",
  },
  "high-performance-complex": {
    title: "High-Performance & Complex Endorsements",
    desc: "Handle aircraft-specific training signoffs with clear scope, records, and limitations.",
    href: "/endorsements/high-performance-complex",
  },
  tailwheel: {
    title: "Tailwheel Endorsements",
    desc: "Capture tailwheel training and authorization clearly enough to avoid ambiguous signoffs.",
    href: "/endorsements/tailwheel",
  },
  "instrument-proficiency": {
    title: "Instrument Proficiency Endorsements",
    desc: "Keep IPC and instrument-related proficiency records clearer, narrower, and easier to verify.",
    href: "/endorsements/instrument-proficiency",
  },
  "additional-category-class": {
    title: "Additional Category/Class Endorsements",
    desc: "Document add-on training scenarios with scope that matches the certificate or rating path.",
    href: "/endorsements/additional-category-class",
  },
  "solo-cross-country": {
    title: "Solo Cross-Country Endorsements",
    desc: "Handle student solo cross-country authorizations with clearer route, scope, and recordkeeping language.",
    href: "/endorsements/solo-cross-country",
  },
  "multi-engine": {
    title: "Multi-Engine Endorsements",
    desc: "Document multi-engine training scenarios with scope that matches the aircraft and rating path.",
    href: "/endorsements/multi-engine",
  },
  "spin-training": {
    title: "Spin Training Endorsements",
    desc: "Keep spin training records explicit about training context, scope, and instructor signoff.",
    href: "/endorsements/spin-training",
  },
  "instrument-knowledge-test": {
    title: "Instrument Knowledge Test Endorsements",
    desc: "A narrower guide for instrument knowledge test signoffs where test scope and training context need to be explicit.",
    href: "/endorsements/instrument-knowledge-test",
  },
  "commercial-knowledge-test": {
    title: "Commercial Knowledge Test Endorsements",
    desc: "A focused guide for commercial knowledge test endorsements with clearer scope and recordkeeping.",
    href: "/endorsements/commercial-knowledge-test",
  },
};

export const endorsementGuides: Record<GuideSlug, EndorsementGuide> = {
  "student-solo": {
    slug: "student-solo",
    metadata: {
      title: "Student Solo Endorsements Guide | PilotSeal",
      description:
        "A practical guide to student solo endorsements for CFIs and student pilots, including scope, common pitfalls, and workflow tips. Always verify against current FAA requirements.",
    },
    breadcrumb: "Student Solo",
    title: "Student Solo Endorsements",
    heroDescription:
      "A practical guide for CFIs and student pilots focused on clarity, scope, and recordkeeping consistency. This is educational—always verify against current FAA requirements.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Student solo endorsements are among the most common—and most frequently templated—logbook entries in training. The goal is not fancy wording; it’s precise authorization that matches the training provided and the exact solo context.",
          "This page focuses on how to think about solo endorsement wording, how to avoid common mistakes, and how to keep your recordkeeping consistent.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the training scenario (initial solo vs. repeated solo vs. special conditions).",
          "Make scope explicit (aircraft category/class; make/model or limitations if applicable).",
          "Include instructor identifiers (name, certificate number, date) in a consistent format.",
          "Avoid copy/paste wording that doesn’t match the actual training record.",
          "Re-verify currency and applicability against current FAA references before signing.",
        ],
      },
      {
        kind: "bullet",
        title: "How to structure the wording",
        intro:
          "Think in terms of authorization and scope:",
        items: [
          "Authorization statement: clearly states the student is authorized for solo flight under the relevant training context.",
          "Aircraft scope: category/class, and any make/model limitations if your context requires it.",
          "Recordkeeping: date and instructor identifiers in a consistent format.",
        ],
        outro:
          "Consistency matters. A clean, repeatable format reduces errors and makes audits/reviews far less painful.",
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Ambiguous scope",
            desc: "The wording doesn’t clearly tie to the aircraft category/class or the specific solo authorization context.",
          },
          {
            title: "Missing identifiers",
            desc: "Instructor certificate number, date, or other required identifiers are missing or inconsistent across records.",
          },
          {
            title: "Template drift",
            desc: "A copied template becomes outdated over time or diverges from the actual scenario being endorsed.",
          },
          {
            title: "Assuming one endorsement covers everything",
            desc: "Different solo contexts may require different elements. Don’t assume a single generic text always applies.",
          },
        ],
      },
    ],
    ctaDescription:
      "If you already know the solo scenario you’re working with, use the Endorsement Generator to create a consistent draft, then verify scope and applicability before signing.",
    faqs: [
      {
        q: "Is this page a substitute for FAR/AIM or FAA guidance?",
        a: "No. This guide is educational. Always verify requirements and wording against current FAA regulations and guidance for your specific scenario.",
      },
      {
        q: "Can I use PilotSeal’s tool output as-is?",
        a: "Use it as a structured starting point. You should confirm the scope, limitations, identifiers, and regulatory applicability before signing or recording.",
      },
      {
        q: "Why is solo endorsement wording so sensitive?",
        a: "Because it authorizes a specific activity and must align with the training provided and the context. Clarity reduces compliance risk and confusion later.",
      },
    ],
    relatedGuideSlugs: ["knowledge-test", "practical-test"],
  },
  "knowledge-test": {
    slug: "knowledge-test",
    metadata: {
      title: "Knowledge Test Endorsements Guide | PilotSeal",
      description:
        "A practical guide to FAA knowledge test endorsements for CFIs and student pilots, including scope, recordkeeping, and common pitfalls. Always verify against current FAA requirements.",
    },
    breadcrumb: "Knowledge Test",
    title: "Knowledge Test Endorsements",
    heroDescription:
      "A practical guide focused on clear scope, verifiable recordkeeping, and reducing template mistakes. Educational only—always verify against current FAA requirements.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Knowledge test endorsements are common across multiple certificates and ratings. Most issues come from vague scope (“the test”) or using generic text that doesn’t clearly match the applicant’s goal.",
          "This page focuses on how to write endorsements that are explicit, consistent, and easier to validate later.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the certificate/rating sought and the specific knowledge test.",
          "Verify required ground training/review has actually been completed for the test scope.",
          "Make the endorsement scope explicit (certificate/rating + test type).",
          "Include instructor identifiers (name, certificate number, date) consistently.",
          "Avoid reusing old templates without verifying current regulatory applicability.",
        ],
      },
      {
        kind: "bullet",
        title: "How to structure the wording",
        intro:
          "Think of a knowledge-test endorsement as a statement of authorization plus scope:",
        items: [
          "Authorization statement: the applicant is authorized to take a specific knowledge test.",
          "Scope: certificate/rating sought, the test type, and any relevant context.",
          "Recordkeeping: date and instructor identifiers in a consistent format.",
        ],
        outro:
          "The best endorsements make it hard to misunderstand what test is authorized and why the instructor is signing.",
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Wrong test or wrong scope",
            desc: "Endorsement wording doesn’t clearly match the certificate/rating or test the applicant intends to take.",
          },
          {
            title: "Assuming “ground done” without documentation",
            desc: "A signoff implies a review/coverage occurred. Make sure training records support what is being endorsed.",
          },
          {
            title: "Template drift over time",
            desc: "Old phrasing gets copied forward without confirming it still aligns with current expectations or your scenario.",
          },
          {
            title: "Missing instructor identifiers",
            desc: "Incomplete instructor info makes records harder to validate and can cause avoidable friction later.",
          },
        ],
      },
    ],
    ctaDescription:
      "If you already know which knowledge test applies, use the generator for a consistent draft, then verify scope and applicability before signing.",
    faqs: [
      {
        q: "Does PilotSeal replace FAA regulations or guidance for knowledge tests?",
        a: "No. This page is educational. Always verify current requirements, references, and applicability for your specific scenario.",
      },
      {
        q: "What’s the main goal of a knowledge-test endorsement?",
        a: "Clarity: the endorsement should make it obvious what test is authorized and why the instructor is signing (training/review completed).",
      },
      {
        q: "Can I use the Endorsement Generator output directly?",
        a: "Use it as a structured draft. Confirm scope, identifiers, and that it reflects the actual training/review performed before signing.",
      },
    ],
    relatedGuideSlugs: ["student-solo", "practical-test"],
  },
  "practical-test": {
    slug: "practical-test",
    metadata: {
      title: "Practical Test Endorsements Guide | PilotSeal",
      description:
        "A practical guide to checkride/practical test endorsements for CFIs and applicants, covering scope, consistency, and common pitfalls. Always verify against current FAA requirements.",
    },
    breadcrumb: "Practical Test",
    title: "Practical Test (Checkride) Endorsements",
    heroDescription:
      "A practical guide for writing explicit, verifiable checkride endorsements that match your training records. Educational only—always verify against current FAA requirements.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Practical-test endorsements are high-stakes because they are often reviewed by examiners and must align with the applicant’s certificate/rating goal and training record.",
          "This page focuses on endorsement clarity, scope, and recordkeeping consistency so the checkride authorization is easy to validate.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the certificate/rating sought and the practical test context (initial vs. add-on, etc.).",
          "Ensure training records support the endorsement statement being made.",
          "Make scope explicit (category/class; rating/certificate) and avoid ambiguous language.",
          "Include instructor identifiers consistently (name, certificate number, date).",
          "Verify currency/applicability against current FAA references before signing.",
        ],
      },
      {
        kind: "bullet",
        title: "How to structure the wording",
        intro:
          "A practical-test endorsement is essentially a statement that:",
        items: [
          "required training has been provided and reviewed,",
          "the applicant is prepared for the practical test,",
          "and the endorsement scope matches the certificate/rating and category/class context.",
        ],
        outro:
          "Avoid “one-size-fits-all” phrasing. The more clearly the endorsement matches the scenario, the less friction you’ll see with examiners and scheduling.",
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Overly generic endorsement",
            desc: "Wording is too vague to clearly tie training and readiness to the certificate/rating being tested.",
          },
          {
            title: "Mismatch between training and endorsement",
            desc: "The endorsement implies completion/readiness that isn’t supported by the training record or scenario.",
          },
          {
            title: "Scope confusion (category/class / rating)",
            desc: "Missing or unclear scope details can create confusion during scheduling or with the examiner later.",
          },
          {
            title: "Inconsistent identifiers / formatting",
            desc: "Incomplete instructor info or inconsistent formatting makes verification harder and increases friction.",
          },
        ],
      },
    ],
    ctaDescription:
      "If you’re preparing an applicant for a checkride, use the generator to create a consistent draft, then verify scope and applicability before signing.",
    faqs: [
      {
        q: "Is this page a substitute for FAA regs, ACS, or examiner guidance?",
        a: "No. This is educational only. Always verify requirements, references, and applicability for your checkride scenario.",
      },
      {
        q: "What makes a practical-test endorsement ‘good’?",
        a: "It is explicit about what certificate/rating is being endorsed, consistent in recordkeeping, and matches the actual training and readiness being attested to.",
      },
      {
        q: "Can I use PilotSeal’s generated text as-is?",
        a: "Use it as a draft. Confirm scope and applicability, and ensure it matches the training record and your scenario before signing.",
      },
    ],
    relatedGuideSlugs: ["student-solo", "knowledge-test"],
  },
  "flight-review-currency": {
    slug: "flight-review-currency",
    metadata: {
      title: "Flight Review & Currency Endorsements Guide | PilotSeal",
      description:
        "A practical guide to flight review and currency-related endorsements, focused on scope, recordkeeping, and avoiding vague signoffs.",
    },
    breadcrumb: "Flight Review & Currency",
    title: "Flight Review & Currency Endorsements",
    heroDescription:
      "A practical guide for documenting flight reviews, recurrent training, and other proficiency-related signoffs with wording that is easier to interpret later.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Review and currency-related records are often where vague wording starts to create problems. These entries may look routine, but they still need to match the actual training event and the authorization, if any, that flows from it.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the exact review, recurrent training, or proficiency context before drafting.",
          "Make the endorsement specific enough that a later reviewer can understand what was completed.",
          "Avoid blending a flight review with other signoffs unless the training and wording clearly support it.",
          "Include date, instructor identifiers, and any scope details consistently.",
          "Verify current FAA applicability before signing any recurrent or proficiency-related wording.",
        ],
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Treating all recurrent training as interchangeable",
            desc: "Flight reviews, currency work, and proficiency-related signoffs are not the same thing, even if they happen in the same period of training.",
          },
          {
            title: "Vague wording around what was completed",
            desc: "A later reader should not have to infer whether the pilot completed a flight review, a checkout, or some other recurrent training event.",
          },
          {
            title: "Missing boundaries or limitations",
            desc: "When the scope is narrow or tied to a specific aircraft or operation, the endorsement should not read like a blanket authorization.",
          },
        ],
      },
    ],
    ctaDescription:
      "If you already know the review or proficiency context, use the generator as a structured drafting starting point, then verify final wording before signing.",
    faqs: [
      {
        q: "Is a flight review endorsement the same as other currency signoffs?",
        a: "Not necessarily. This page is about keeping review and currency-related records clear so the wording matches the actual training and authorization context.",
      },
      {
        q: "Why do these endorsements create confusion?",
        a: "Because instructors often combine recurrent training events in practice, but the records still need to be explicit about what was actually completed.",
      },
    ],
  },
  "high-performance-complex": {
    slug: "high-performance-complex",
    metadata: {
      title: "High-Performance & Complex Endorsements Guide | PilotSeal",
      description:
        "A practical guide to high-performance and complex aircraft endorsements, focused on scope, aircraft context, and clear records.",
    },
    breadcrumb: "High-Performance & Complex",
    title: "High-Performance & Complex Endorsements",
    heroDescription:
      "A practical guide for aircraft-specific endorsements where clear scope and clean recordkeeping matter as much as the training itself.",
    sections: [
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm whether the training applies to high-performance, complex, or both.",
          "Make the aircraft context and endorsement scope explicit enough to prevent confusion later.",
          "Avoid generic wording that hides what aircraft-specific training actually occurred.",
          "Keep instructor identifiers and dates consistent across logbook and training records.",
          "Review wording carefully before signing if the training involved multiple aircraft or transition elements.",
        ],
      },
      {
        kind: "cards",
        title: "Why these signoffs deserve extra care",
        items: [
          {
            title: "Aircraft-specific endorsements need tighter scope",
            desc: "These signoffs often sit close to aircraft transition training, so wording should make it clear what the pilot was trained for and what endorsement applies.",
          },
          {
            title: "Record clarity matters later",
            desc: "If the pilot changes aircraft, instructors or reviewers may rely on the original endorsement record to understand what was completed.",
          },
          {
            title: "Do not hide details behind shorthand",
            desc: "Abbreviated notes may feel efficient in the moment, but they make later verification much harder when questions come up.",
          },
        ],
      },
    ],
    ctaDescription:
      "When the training context is already clear, the generator can help you move from rough notes to more consistent draft wording.",
  },
  tailwheel: {
    slug: "tailwheel",
    metadata: {
      title: "Tailwheel Endorsements Guide | PilotSeal",
      description:
        "A practical guide to tailwheel endorsements, focused on training alignment, recordkeeping, and reducing ambiguity in signoffs.",
    },
    breadcrumb: "Tailwheel",
    title: "Tailwheel Endorsements",
    heroDescription:
      "A practical guide to tailwheel endorsements for instructors who want clearer records, more consistent wording, and fewer ambiguous signoffs.",
    sections: [
      {
        kind: "bullet",
        title: "Core principles",
        items: [
          "The endorsement should match the actual tailwheel training given, not a borrowed template.",
          "Aircraft context matters if the record may be reviewed later by another instructor or operator.",
          "Readable, complete instructor identifiers make later validation easier.",
          "Clear scope is better than relying on shorthand or assumptions.",
        ],
      },
      {
        kind: "text",
        title: "Where instructors get tripped up",
        paragraphs: [
          "Tailwheel endorsements can look simple, but the quality of the record still matters. Problems usually come from generic wording, incomplete identifiers, or notes that make sense only to the person who wrote them.",
          "The safest approach is to write the record so another instructor can quickly understand what was trained, what was authorized, and who signed it.",
        ],
      },
    ],
    ctaDescription:
      "If the training scenario is already defined, use the generator to create a more consistent draft before final review.",
    faqs: [
      {
        q: "Why add a dedicated tailwheel page?",
        a: "Because aircraft-specific endorsements are often where shorthand wording starts to replace clarity. Tailwheel signoffs benefit from a page that keeps the training context front and center.",
      },
      {
        q: "Is this page a replacement for FAA references?",
        a: "No. It is educational only. Always verify current requirements and applicability for the exact aircraft and training scenario.",
      },
    ],
  },
  "instrument-proficiency": {
    slug: "instrument-proficiency",
    metadata: {
      title: "Instrument Proficiency Endorsements Guide | PilotSeal",
      description:
        "A practical guide to instrument proficiency and IPC-related endorsements, focused on scope, training alignment, and cleaner records.",
    },
    breadcrumb: "Instrument Proficiency",
    title: "Instrument Proficiency Endorsements",
    heroDescription:
      "A practical guide for instrument-related proficiency records where wording needs to stay closely aligned with the actual review, evaluation, and authorization context.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Instrument proficiency entries are easy to blur together with other recurrent training unless the wording clearly reflects what was actually reviewed, evaluated, or completed.",
          "This page focuses on keeping those records specific enough that another instructor, examiner, or reviewer can understand them later without guessing.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the exact instrument proficiency context before drafting anything.",
          "Make sure the endorsement or record matches the actual evaluation and training performed.",
          "Avoid broad wording that sounds like a blanket signoff when the scope was narrower.",
          "Keep date, instructor identifiers, and any relevant conditions consistent.",
          "Verify current FAA applicability before finalizing wording.",
        ],
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Mixing proficiency and currency language",
            desc: "A record can become misleading when it blends instrument proficiency work with other recurrent items without clearly separating what was actually completed.",
          },
          {
            title: "Overstating scope",
            desc: "The wording should not imply more authorization or evaluation than the training event actually supports.",
          },
          {
            title: "Weak recordkeeping details",
            desc: "Instrument-related records are often reviewed later, so missing dates or identifiers create unnecessary friction.",
          },
        ],
      },
    ],
    ctaDescription:
      "If the instrument training context is already defined, use the generator to draft cleaner wording, then verify scope and applicability before signing.",
    faqs: [
      {
        q: "Is this page only about IPCs?",
        a: "No. It is broader than a single scenario and is meant to help keep instrument-related proficiency records explicit and easier to interpret.",
      },
      {
        q: "Why does wording matter so much here?",
        a: "Because instrument records are often revisited later, and vague wording makes it harder to tell what was actually evaluated or authorized.",
      },
    ],
    relatedGuideSlugs: ["flight-review-currency", "practical-test"],
  },
  "additional-category-class": {
    slug: "additional-category-class",
    metadata: {
      title: "Additional Category/Class Endorsements Guide | PilotSeal",
      description:
        "A practical guide to additional category and class endorsements, focused on scope, add-on context, and avoiding generic signoffs.",
    },
    breadcrumb: "Additional Category/Class",
    title: "Additional Category/Class Endorsements",
    heroDescription:
      "A practical guide for add-on training scenarios where the endorsement needs to track the exact certificate or class path without collapsing into generic wording.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Add-on scenarios often create wording problems because the pilot already holds some privileges, but the endorsement still needs to be explicit about what new category or class training is being documented.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Identify the exact add-on path before drafting the endorsement.",
          "Make the category/class scope explicit enough that the wording cannot be mistaken for an initial certificate scenario.",
          "Ensure the training record supports the endorsement language being used.",
          "Keep instructor identifiers and dates consistent across records.",
          "Re-check current FAA applicability before signing.",
        ],
      },
      {
        kind: "bullet",
        title: "Where instructors lose clarity",
        intro:
          "Most add-on mistakes come from wording that is too broad for the actual path being trained.",
        items: [
          "Using initial-certificate style language for an add-on scenario.",
          "Leaving category/class details too vague.",
          "Assuming the reviewer will infer what training path was intended.",
        ],
        outro:
          "Clear scope reduces confusion for scheduling, record review, and later training decisions.",
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Generic add-on wording",
            desc: "If the wording could apply to multiple paths, it is probably not specific enough for the actual training scenario.",
          },
          {
            title: "Mismatch with training records",
            desc: "The logbook entry should not imply a training scope or readiness finding that the records do not support.",
          },
          {
            title: "Missing context for later reviewers",
            desc: "Another instructor should not have to reconstruct the path from memory or scattered notes.",
          },
        ],
      },
    ],
    ctaDescription:
      "If you already know the add-on path, use the generator to create a more consistent draft before final review and signing.",
    faqs: [
      {
        q: "Why does add-on wording need its own page?",
        a: "Because these scenarios are often close enough to other endorsements that people reuse language that no longer matches the real training path.",
      },
    ],
    relatedGuideSlugs: ["practical-test", "knowledge-test"],
  },
  "solo-cross-country": {
    slug: "solo-cross-country",
    metadata: {
      title: "Solo Cross-Country Endorsements Guide | PilotSeal",
      description:
        "A practical guide to student solo cross-country endorsements, focused on route scope, planning context, and cleaner authorization records.",
    },
    breadcrumb: "Solo Cross-Country",
    title: "Solo Cross-Country Endorsements",
    heroDescription:
      "A practical guide for student solo cross-country scenarios where route, scope, and clear authorization language matter more than generic solo wording.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Solo cross-country endorsements need more specificity than many local solo records because the authorization context is often narrower and tied to planning assumptions.",
          "This page focuses on keeping route-related scope and recordkeeping clear enough that the endorsement reflects the actual authorization being given.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the exact solo cross-country scenario before drafting.",
          "Make route, limitations, and aircraft context explicit where they matter.",
          "Ensure the endorsement matches the planning review and training actually completed.",
          "Include instructor identifiers, date, and readable wording consistently.",
          "Avoid stretching a local solo template into a cross-country signoff without revising scope.",
        ],
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Using local solo wording for a cross-country scenario",
            desc: "Cross-country authorizations often need more contextual detail than ordinary local solo records.",
          },
          {
            title: "Weak route or limitation clarity",
            desc: "If another reviewer cannot tell what was actually authorized, the wording is too loose.",
          },
          {
            title: "Record does not reflect the planning review",
            desc: "A solo cross-country endorsement should line up with the actual preparation and review that occurred beforehand.",
          },
        ],
      },
    ],
    ctaDescription:
      "If the student’s solo cross-country context is already defined, use the generator to draft cleaner authorization wording before final instructor review.",
    faqs: [
      {
        q: "Why separate solo cross-country from general solo endorsements?",
        a: "Because the authorization context is often more specific, and the record usually benefits from clearer route and planning-related scope.",
      },
    ],
    relatedGuideSlugs: ["student-solo", "flight-review-currency"],
  },
  "multi-engine": {
    slug: "multi-engine",
    metadata: {
      title: "Multi-Engine Endorsements Guide | PilotSeal",
      description:
        "A practical guide to multi-engine endorsements, focused on aircraft context, rating path, and clear recordkeeping.",
    },
    breadcrumb: "Multi-Engine",
    title: "Multi-Engine Endorsements",
    heroDescription:
      "A practical guide for multi-engine training scenarios where the endorsement needs to reflect both the aircraft context and the exact certification path being trained.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Multi-engine training often sits close to add-on, transition, or practical-test preparation, which makes vague wording especially risky.",
          "This page focuses on keeping the record explicit about what training path the pilot is on and what the signoff actually supports.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the exact multi-engine training and certification context before drafting.",
          "Write the scope so it matches the aircraft and rating path actually involved.",
          "Avoid generic wording that could apply to multiple training scenarios.",
          "Keep instructor identifiers, date, and supporting record details consistent.",
          "Verify applicability before signing if the scenario overlaps with add-on or checkride prep.",
        ],
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Blurring transition and certification language",
            desc: "The endorsement should make clear whether it is documenting qualification toward a rating path, aircraft-specific training, or both.",
          },
          {
            title: "Weak aircraft context",
            desc: "If the record hides the training context behind shorthand, later review becomes harder than it needs to be.",
          },
          {
            title: "Overly broad wording",
            desc: "A multi-engine signoff should not read like it authorizes more than the actual training supports.",
          },
        ],
      },
    ],
    ctaDescription:
      "If the multi-engine training path is already clear, use the generator to create a cleaner draft before final review and signing.",
    faqs: [
      {
        q: "Why separate multi-engine from other add-on pages?",
        a: "Because multi-engine training often combines aircraft-specific and certification-path issues, and those details are where records usually get sloppy.",
      },
    ],
    relatedGuideSlugs: ["additional-category-class", "practical-test"],
  },
  "spin-training": {
    slug: "spin-training",
    metadata: {
      title: "Spin Training Endorsements Guide | PilotSeal",
      description:
        "A practical guide to spin training endorsements, focused on training context, scope, and reducing ambiguous records.",
    },
    breadcrumb: "Spin Training",
    title: "Spin Training Endorsements",
    heroDescription:
      "A practical guide for spin training records where the endorsement should stay tightly aligned with the training purpose, scope, and instructor documentation.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Spin training records benefit from direct, unambiguous language because the training context is often specific and later reviewers may rely on the logbook entry more than surrounding notes.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the exact spin training context before writing the endorsement.",
          "Keep the wording narrow enough to reflect the actual training purpose.",
          "Avoid relying on shorthand that only makes sense inside one school or instructor workflow.",
          "Include instructor identifiers and date in a consistent format.",
          "Verify that the written record matches the actual training given.",
        ],
      },
      {
        kind: "bullet",
        title: "Where records usually break down",
        items: [
          "The endorsement sounds broader than the actual training event.",
          "The record omits the context that explains why spin training was given.",
          "Another instructor would need outside notes to understand what happened.",
        ],
        outro:
          "The cleaner approach is to write the record so it stands on its own without school-specific shorthand.",
      },
    ],
    ctaDescription:
      "If the spin training scenario is already defined, use the generator to create a more consistent draft before final signoff.",
    faqs: [
      {
        q: "Why add a dedicated spin training page?",
        a: "Because narrower training scenarios often get forced into generic templates, and that is where scope starts to drift away from the actual record.",
      },
    ],
    relatedGuideSlugs: ["tailwheel", "flight-review-currency"],
  },
  "instrument-knowledge-test": {
    slug: "instrument-knowledge-test",
    metadata: {
      title: "Instrument Knowledge Test Endorsements Guide | PilotSeal",
      description:
        "A practical guide to instrument knowledge test endorsements, focused on test scope, training alignment, and clear recordkeeping.",
    },
    breadcrumb: "Instrument Knowledge Test",
    title: "Instrument Knowledge Test Endorsements",
    heroDescription:
      "A focused guide for instrument knowledge test endorsements where the exact test scope and ground training context should be obvious from the wording.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Instrument knowledge test endorsements are easy to muddy with generic test language, especially when multiple training paths are active around the same time.",
          "This page narrows the focus so the record clearly reflects the instrument test context rather than a generic knowledge-test signoff.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the exact instrument knowledge test before drafting.",
          "Make sure the endorsement language reflects the actual ground training or review completed.",
          "Avoid wording that could be mistaken for another certificate or rating path.",
          "Keep instructor identifiers and date consistent.",
          "Review scope before signing if multiple tests are being prepared in parallel.",
        ],
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Generic test wording",
            desc: "If the signoff could apply to a different test path, it is not specific enough.",
          },
          {
            title: "Ground training record mismatch",
            desc: "The endorsement should line up with what was actually reviewed or completed for the instrument test.",
          },
          {
            title: "Confusing parallel training paths",
            desc: "When a pilot is working on multiple goals, narrow wording matters even more.",
          },
        ],
      },
    ],
    ctaDescription:
      "If the instrument knowledge test path is already defined, use the generator to produce a cleaner draft before final review and signing.",
    faqs: [
      {
        q: "Why create a separate instrument knowledge-test page?",
        a: "Because the general knowledge-test page is broader, while this page keeps the wording focused on the instrument test path specifically.",
      },
    ],
    relatedGuideSlugs: ["knowledge-test", "instrument-proficiency"],
  },
  "commercial-knowledge-test": {
    slug: "commercial-knowledge-test",
    metadata: {
      title: "Commercial Knowledge Test Endorsements Guide | PilotSeal",
      description:
        "A practical guide to commercial knowledge test endorsements, focused on clearer scope, ground training alignment, and recordkeeping.",
    },
    breadcrumb: "Commercial Knowledge Test",
    title: "Commercial Knowledge Test Endorsements",
    heroDescription:
      "A focused guide for commercial knowledge test endorsements where the record should clearly match the commercial training path and the exact test being authorized.",
    sections: [
      {
        kind: "text",
        title: "What this covers",
        paragraphs: [
          "Commercial training often overlaps with other certificate or rating activity, so commercial knowledge-test wording should be specific enough that the intended test is unmistakable.",
        ],
      },
      {
        kind: "checklist",
        title: "Quick checklist",
        items: [
          "Confirm the exact commercial knowledge test before drafting.",
          "Make the commercial path explicit rather than relying on generic knowledge-test language.",
          "Ensure the endorsement is supported by the actual ground training or review performed.",
          "Keep instructor identifiers and date clean and consistent.",
          "Check that the wording would still make sense to a later reviewer with no extra context.",
        ],
      },
      {
        kind: "bullet",
        title: "Why this page is narrower than the general guide",
        items: [
          "Commercial knowledge-test records often get mixed with broader training notes.",
          "A narrow page reduces the temptation to reuse generic wording.",
          "The cleaner the wording, the easier later review becomes.",
        ],
      },
      {
        kind: "cards",
        title: "Common pitfalls",
        items: [
          {
            title: "Over-generalized signoff text",
            desc: "A commercial-specific endorsement should not read like a placeholder for any knowledge test.",
          },
          {
            title: "Weak training alignment",
            desc: "If the signoff language outruns the actual review or ground work completed, the record becomes harder to defend.",
          },
          {
            title: "Missing clarity for later reviewers",
            desc: "Another instructor should be able to tell the exact test path from the endorsement itself.",
          },
        ],
      },
    ],
    ctaDescription:
      "If the commercial knowledge test scenario is already clear, use the generator to draft cleaner wording before final instructor review.",
    faqs: [
      {
        q: "Why split out a commercial knowledge-test page?",
        a: "Because narrower test pages make it easier to keep the wording aligned with the specific certificate path instead of relying on one-size-fits-all language.",
      },
    ],
    relatedGuideSlugs: ["knowledge-test", "additional-category-class"],
  },
};
