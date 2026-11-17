/** Plain-language walkthrough of Stripe's payout setup, shown where coaches start it. */
export function PayoutGuide() {
  return (
    <details className="mt-3 rounded-lg border border-line px-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold">
        Not sure what to expect? Walk me through it<span aria-hidden className="text-gold">+</span>
      </summary>
      <div className="flex flex-col gap-3 pb-3 text-sm text-soft">
        <div>
          <div className="font-semibold text-cream">Have these ready (about 5 minutes)</div>
          <ul className="mt-1 list-disc pl-5">
            <li>Your phone, for a text code</li>
            <li>Your legal name, date of birth and home address</li>
            <li>Your Social Security number (Stripe may ask for just the last 4 digits). The IRS requires it for anyone who gets paid.</li>
            <li>Your bank&apos;s routing and account numbers (on a check or in your bank app), or a debit card</li>
          </ul>
        </div>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li><b className="text-cream">Tap the gold button.</b> It opens Stripe&apos;s secure page. That&apos;s normal; Stripe is the payment company that sends your money.</li>
          <li><b className="text-cream">Confirm your phone.</b> Enter the code Stripe texts you.</li>
          <li><b className="text-cream">Say you&apos;re an individual</b> if it asks what kind of business you are. You&apos;re paid as yourself.</li>
          <li><b className="text-cream">Fill in your details.</b> Name, birthday, address and SSN. If it asks for a website or business description, a short line like &ldquo;youth sports coaching&rdquo; is fine.</li>
          <li><b className="text-cream">Add your bank account.</b> This is where your Friday payouts go.</li>
          <li><b className="text-cream">Review and submit.</b> You land back here. Stripe can take a few minutes to confirm, and this page updates when it does.</li>
        </ol>
        <div>
          <div className="font-semibold text-cream">Good to know</div>
          <ul className="mt-1 list-disc pl-5">
            <li>ProLyt never sees your bank or SSN. Only Stripe does.</li>
            <li>Closed the page early? Come back and tap &ldquo;Finish payout setup&rdquo;. You pick up where you stopped.</li>
            <li>Stripe asks for more info? Same button, answer what it asks.</li>
            <li>Stuck? Message your program owner and tell them which step.</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
