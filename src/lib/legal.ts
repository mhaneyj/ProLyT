// Plain-language legal documents shown to families. Written as a working draft for the program's attorney to review.
// {program} is replaced with the program's name; {contact} with SUPPORT_EMAIL (or "through the app").

export type LegalDoc = { title: string; intro: string; sections: { h: string; p?: string[]; list?: string[] }[] };

export const LEGAL_UPDATED = "November 10, 2026";

export const LEGAL: Record<string, LegalDoc> = {
  privacy: {
    title: "Family privacy notice",
    intro: "{program} uses ProLyt to run schedules, results, film, messages and events. This notice explains what we collect about your family, who can see it, and the choices you have. We never sell your information and we show no ads.",
    sections: [
      { h: "What we collect", list: [
        "Parent or guardian: your name, email, and the password or passkey you choose.",
        "Athlete: name, birth date, graduation year, position, sport and, if you add them, a photo, school, hometown, height, weight, bio and highlight links.",
        "Training: attendance, results your coaches measure, coach notes, and game film or clips.",
        "Safety: an emergency contact, and any allergies or medical notes you choose to share.",
        "Events: team sign-ups, signed waivers, check-ins, and scores.",
        "Messages you send in the app, and reports of posts or messages.",
        "Payments: handled by Stripe. We see the package and payment status, never your card number.",
        "Use of the app: which pages and features are used, and which shared link brought someone in. This is tied to an account id, not to messages or personal details.",
      ] },
      { h: "Who can see what", list: [
        "You: everything about your own athletes. You can download it all from the athlete's profile at any time.",
        "Coaches of a program your athlete belongs to: the profile, results, attendance, film and notes for that athlete. Only coaches see school, allergies and medical notes.",
        "Event hosts, for events your athlete is registered for: name, team, position, age on the cutoff date, grade and photo, plus the birth date for age checks.",
        "Other ProLyt members: only athletes 13 or older whose parent turned on the ProLyt network. They see name, position, class, verified results, highlights and posts. Never birth date, school, contact details or coach notes.",
        "Anyone with a recruiting link you share: the same limited profile. You can turn a link off at any time.",
        "ProLyt staff: only what is needed to run and support the service, such as reviewing an age document or a reported post.",
      ] },
      { h: "Children under 13", p: [
        "A parent or guardian creates and manages the profile of any athlete under 13. These profiles are never listed on the ProLyt network, are never shown to the public, and cannot receive messages that leave the parent out. We collect only what the program needs to coach and run events, and you can review or delete it at any time.",
        "For athletes 13 to 17, a parent approves the profile before anything is shown to other members, and every message between a coach and a minor includes the parent.",
      ] },
      { h: "Age verification documents", p: [
        "If an event asks for proof of age, you can upload a photo of a birth certificate, passport, ID or report card. Only the event's host or ProLyt staff can view it, and every view is recorded. The document is deleted as soon as it is reviewed, or after 30 days if nobody reviews it. We keep only the result: verified, the date shown, and who checked.",
      ] },
      { h: "Companies that help us run ProLyt", p: [
        "We use a small number of service providers, each only for its job and under its own privacy and security terms: Vercel (hosting and video storage), Neon (database), Resend (email) and Stripe (payments). We do not share your information with advertisers or data brokers.",
      ] },
      { h: "How long we keep it", p: [
        "We keep an athlete's record while the account is active so their history stays with them. Age documents are deleted as described above. When you ask us to delete an athlete or your account, we delete it within 30 days, except for records the law requires us to keep, such as payment records.",
      ] },
      { h: "Your choices", list: [
        "See and download everything about your athlete from their profile.",
        "Correct details on the Edit page, or ask your coach to correct a result.",
        "Turn the ProLyt network on or off, and revoke recruiting links, at any time.",
        "Give or withdraw permission for coaches to photograph or film your athlete.",
        "Ask us to delete your athlete's profile or your account: {contact}.",
      ] },
      { h: "Security", p: [
        "Information travels encrypted. Access rules in the database decide who can read each record, so a mistake in one screen cannot expose another family's data. Sensitive actions, such as viewing an age document or changing permissions, are logged.",
      ] },
      { h: "Changes and questions", p: [
        "If we make a meaningful change, we will tell you in the app before it takes effect. Questions or requests: {contact}.",
      ] },
    ],
  },

  participation: {
    title: "Participation terms",
    intro: "These terms are between your family and {program}, which uses ProLyt to run the program. By registering an athlete, you agree to them.",
    sections: [
      { h: "Registration", list: [
        "Give accurate information, especially the athlete's birth date and graduation year. Divisions and events rely on them.",
        "You confirm that you are the athlete's parent or legal guardian, or the athlete if 18 or older.",
        "Keep the emergency contact and any medical notes up to date.",
      ] },
      { h: "Packages and payments", list: [
        "Packages renew monthly until you cancel. Cancelling stops the next renewal; the current month stays active.",
        "Missed sessions are not refunded unless {program} cancels them.",
        "If a payment fails, booking may pause until it is fixed.",
        "Event fees, if any, are set by each event's host.",
      ] },
      { h: "Health and safety", list: [
        "Your athlete is physically able to take part, and you will tell the coach about any injury, condition or allergy that matters for training.",
        "Coaches may stop an athlete from training or playing if they believe it is unsafe, including any suspected concussion. The athlete returns only with a medical clearance where the law requires one.",
      ] },
      { h: "Conduct", p: [
        "Athletes, parents and coaches treat each other with respect, on the field and in the app. {program} may suspend or remove anyone whose behavior puts others at risk or breaks these terms.",
      ] },
      { h: "Photos and film", p: [
        "Coaches photograph or film an athlete only if you allowed it at registration, and use it for training. Nothing is posted publicly by the program without your approval each time. You can change this permission at any time.",
      ] },
      { h: "What you post", p: [
        "You own the photos, video and text you post. You let ProLyt show them to the people your settings allow. Do not post anyone else's child without their parent's permission, or anything hateful, sexual, threatening or private. Reported posts are reviewed and may be hidden.",
      ] },
      { h: "Accounts", p: [
        "Keep your sign-in private. A parent manages the login of an athlete under 18. Tell us right away if you think someone else used your account.",
      ] },
      { h: "The role of ProLyt", p: [
        "ProLyt provides the software. {program} is responsible for its coaching, sessions and events, and each event host for its event. ProLyt is not liable for the program's or a host's services.",
      ] },
      { h: "Ending", p: [
        "You may stop at any time by cancelling your package and, if you wish, deleting your athlete's profile. {program} may end participation with notice. These terms are governed by California law.",
      ] },
    ],
  },

  waiver: {
    title: "Liability waiver",
    intro: "Football, including 7v7 and line play, is a physical sport. Please read this carefully. By signing, you give up certain legal rights.",
    sections: [
      { h: "Risks", p: [
        "Training and games involve running, cutting, jumping, blocking, tackling drills, catching and contact with other players, equipment and the ground. Injuries can happen even when everyone is careful, including sprains, broken bones, heat illness, concussions and, rarely, serious or permanent injury or death.",
      ] },
      { h: "Assumption of risk", p: [
        "I understand these risks and choose to let my athlete take part in {program}'s sessions, camps and events. I will make sure my athlete follows coaches' instructions and safety rules and uses proper equipment.",
      ] },
      { h: "Release", p: [
        "To the fullest extent the law allows, I release and agree not to sue {program}, its coaches, staff and volunteers, the facilities it uses, and ProLyt, for injury, illness, loss or damage arising from my athlete's participation, including claims based on ordinary negligence. This release does not cover gross negligence or willful misconduct.",
      ] },
      { h: "Medical care", p: [
        "If my athlete is hurt or ill and I cannot be reached, I authorize the coaches to arrange first aid and emergency medical treatment that a medical professional believes is necessary. I am responsible for the cost of that care.",
      ] },
      { h: "Concussions", p: [
        "If a concussion is suspected, my athlete will be removed from activity for the rest of the day and will return only with written clearance from a licensed health care provider, as California law requires for youth sports.",
      ] },
      { h: "Signing for a minor", p: [
        "I am the athlete's parent or legal guardian, I sign on their behalf, and I am at least 18. If any part of this waiver is found unenforceable, the rest still applies. California law governs this waiver.",
      ] },
    ],
  },
};
