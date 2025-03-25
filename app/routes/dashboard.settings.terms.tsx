import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import DashboardLayout from "~/components/layout/DashboardLayout";
import Card from "~/components/ui/Card";

export const meta: MetaFunction = () => {
  return [
    { title: "Terms & Conditions | Vested Fitness" },
    { name: "description", content: "Terms and conditions for Vested Fitness" },
  ];
};

export default function TermsAndConditions() {
  return (
    <DashboardLayout userRole="client">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          Settings
        </h1>
      </div>

      <div className="flex border-b border-gray-light dark:border-davyGray mb-6">
        <Link
          to="/dashboard/settings"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:border-primary/50"
        >
          General
        </Link>
        <Link
          to="/dashboard/settings/payment"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:border-primary/50"
        >
          Payment Method
        </Link>
        <Link
          to="/dashboard/settings/terms"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-primary text-primary dark:text-primary"
        >
          Terms & Conditions
        </Link>
      </div>

      <Card>
        <div className="prose max-w-none dark:prose-invert prose-headings:text-secondary dark:prose-headings:text-alabaster prose-p:text-gray-dark dark:prose-p:text-gray-light transition-colors duration-200">
          <h2 className="text-xl font-bold text-secondary dark:text-alabaster mb-4 transition-colors duration-200">
            Terms and Conditions
          </h2>
          <p className="text-sm text-gray-dark dark:text-gray-light transition-colors duration-200">
            Last updated: June 1, 2023
          </p>

          <div className="mt-6 space-y-6">
            <section>
              <h3 className="font-bold text-lg text-secondary dark:text-alabaster transition-colors duration-200">
                1. Introduction
              </h3>
              <p className="dark:text-gray-light transition-colors duration-200">
                Welcome to Vested Fitness ("Company", "we", "our", "us")! As you
                have just clicked our Terms of Service, please pause, grab a
                bowl of Frosted Flakes and carefully read the following pages.
                It will take you approximately 20 minutes.
              </p>
              <p className="dark:text-gray-light transition-colors duration-200">
                These Terms of Service ("Terms", "Terms of Service") govern your
                use of our web application Vested Fitness (the "Service")
                operated by Vested Fitness.
              </p>
              <p className="dark:text-gray-light transition-colors duration-200">
                Our Privacy Policy also governs your use of our Service and
                explains how we collect, safeguard and disclose information that
                results from your use of our Service. Your agreement with us
                includes these Terms and our Privacy Policy ("Agreements"). You
                acknowledge that you have read and understood Agreements, and
                agree to be bound by them.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-lg text-secondary dark:text-alabaster transition-colors duration-200">
                2. Communications
              </h3>
              <p className="dark:text-gray-light transition-colors duration-200">
                By creating an Account on our Service, you agree to subscribe to
                newsletters, marketing or promotional materials and other
                information we may send. However, you may opt out of receiving
                any, or all, of these communications from us by following the
                unsubscribe link or by emailing support@vestedfitness.com.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-lg text-secondary dark:text-alabaster transition-colors duration-200">
                3. Subscriptions
              </h3>
              <p className="dark:text-gray-light transition-colors duration-200">
                Some parts of the Service are billed on a subscription basis
                ("Subscription(s)"). You will be billed in advance on a
                recurring and periodic basis ("Billing Cycle"). Billing cycles
                are set on a monthly or annual basis, depending on the type of
                subscription plan you select when purchasing a Subscription.
              </p>
              <p className="dark:text-gray-light transition-colors duration-200">
                At the end of each Billing Cycle, your Subscription will
                automatically renew under the exact same conditions unless you
                cancel it or Vested Fitness cancels it. You may cancel your
                Subscription renewal either through your online account
                management page or by contacting Vested Fitness customer support
                team.
              </p>
              <p className="dark:text-gray-light transition-colors duration-200">
                A valid payment method, including credit card, is required to
                process the payment for your subscription. You shall provide
                Vested Fitness with accurate and complete billing information
                including full name, address, state, zip code, telephone number,
                and valid payment method information. By submitting such payment
                information, you automatically authorize Vested Fitness to
                charge all Subscription fees incurred through your account to
                any such payment instruments.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-lg text-secondary dark:text-alabaster transition-colors duration-200">
                4. Refunds
              </h3>
              <p className="dark:text-gray-light transition-colors duration-200">
                Certain refund requests for Subscriptions may be considered by
                Vested Fitness on a case-by-case basis and granted at the sole
                discretion of Vested Fitness. Any granted refund will be issued
                through the original method of payment.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-lg text-secondary dark:text-alabaster transition-colors duration-200">
                5. Content
              </h3>
              <p className="dark:text-gray-light transition-colors duration-200">
                Our Service allows you to post, link, store, share and otherwise
                make available certain information, text, graphics, videos, or
                other material ("Content"). You are responsible for Content that
                you post on or through Service, including its legality,
                reliability, and appropriateness.
              </p>
              <p className="dark:text-gray-light transition-colors duration-200">
                By posting Content on or through Service, You represent and
                warrant that: (i) Content is yours (you own it) and/or you have
                the right to use it and the right to grant us the rights and
                license as provided in these Terms, and (ii) that the posting of
                your Content on or through Service does not violate the privacy
                rights, publicity rights, copyrights, contract rights or any
                other rights of any person or entity. We reserve the right to
                terminate the account of anyone found to be infringing on a
                copyright.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-lg text-secondary dark:text-alabaster transition-colors duration-200">
                6. Prohibited Uses
              </h3>
              <p className="dark:text-gray-light transition-colors duration-200">
                You may use Service only for lawful purposes and in accordance
                with Terms. You agree not to use Service:
              </p>
              <ul className="list-disc pl-6 space-y-2 dark:text-gray-light transition-colors duration-200">
                <li>
                  In any way that violates any applicable national or
                  international law or regulation.
                </li>
                <li>
                  For the purpose of exploiting, harming, or attempting to
                  exploit or harm minors in any way by exposing them to
                  inappropriate content or otherwise.
                </li>
                <li>
                  To impersonate or attempt to impersonate Company, a Company
                  employee, another user, or any other person or entity.
                </li>
                <li>
                  In any way that infringes upon the rights of others, or in any
                  way is illegal, threatening, fraudulent, or harmful, or in
                  connection with any unlawful, illegal, fraudulent, or harmful
                  purpose or activity.
                </li>
              </ul>
            </section>

            <section>
              <h3 className="font-bold text-lg text-secondary dark:text-alabaster transition-colors duration-200">
                7. Health Disclaimer
              </h3>
              <p className="dark:text-gray-light transition-colors duration-200">
                Vested Fitness is not a medical organization and our staff
                cannot give you medical advice or diagnosis. The information
                provided through our Service, including workout and nutrition
                plans, is for informational and educational purposes only and is
                not intended as a substitute for advice from your physician or
                other health care professional.
              </p>
              <p className="dark:text-gray-light transition-colors duration-200">
                You should consult with a healthcare professional before
                starting any diet, exercise, or supplementation program, before
                taking any medication, or if you have or suspect you might have
                a health problem.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-lg text-secondary dark:text-alabaster transition-colors duration-200">
                8. Contact Us
              </h3>
              <p className="dark:text-gray-light transition-colors duration-200">
                If you have any questions about these Terms, please contact us
                at support@vestedfitness.com.
              </p>
            </section>
          </div>
        </div>
      </Card>
    </DashboardLayout>
  );
}
