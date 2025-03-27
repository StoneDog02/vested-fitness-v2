import React from "react";
import { Link } from "@remix-run/react";

export default function HelpAndSupport() {
  const faqs = [
    {
      question: "How do I get started with my fitness journey?",
      answer:
        "Getting started is easy! First, complete your profile and set your fitness goals. Then, your coach will create a personalized plan for you including workouts, meal plans, and supplement recommendations.",
    },
    {
      question: "How do I communicate with my coach?",
      answer:
        "You can communicate with your coach through the built-in chat system. Simply navigate to the Chat section in your dashboard to start a conversation.",
    },
    {
      question: "How do I track my progress?",
      answer:
        "Your progress is automatically tracked through the dashboard. You can view your workout history, meal logs, and other metrics in the respective sections of your dashboard.",
    },
    {
      question: "What payment methods do you accept?",
      answer:
        "We accept all major credit cards, PayPal, and bank transfers. You can manage your payment methods in the Billing section of your account settings.",
    },
  ];

  const supportOptions = [
    {
      title: "Email Support",
      description: "Get help via email from our support team",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      ),
      action: "Email Us",
      href: "mailto:support@kavatraining.com",
    },
    {
      title: "Live Chat",
      description: "Chat with our support team in real-time",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
      action: "Start Chat",
      href: "/dashboard/chat",
    },
    {
      title: "Knowledge Base",
      description: "Browse our comprehensive guides and tutorials",
      icon: (
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      ),
      action: "Browse Articles",
      href: "/help/articles",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-secondary dark:text-alabaster mb-4">
          How can we help you?
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Find answers to common questions and get support when you need it.
        </p>
      </div>

      {/* Support Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {supportOptions.map((option) => (
          <div
            key={option.title}
            className="bg-white dark:bg-night p-6 rounded-lg shadow-sm border border-gray-light dark:border-secondary hover:shadow-md transition-shadow duration-200"
          >
            <div className="text-primary mb-4">{option.icon}</div>
            <h3 className="text-lg font-semibold text-secondary dark:text-alabaster mb-2">
              {option.title}
            </h3>
            <p className="text-muted-foreground mb-4">{option.description}</p>
            <Link
              to={option.href}
              className="inline-flex items-center text-primary hover:text-primary/80 transition-colors duration-200"
            >
              {option.action}
              <svg
                className="w-4 h-4 ml-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        ))}
      </div>

      {/* FAQs */}
      <div className="bg-white dark:bg-night rounded-lg shadow-sm border border-gray-light dark:border-secondary p-6">
        <h2 className="text-2xl font-semibold text-secondary dark:text-alabaster mb-6">
          Frequently Asked Questions
        </h2>
        <div className="space-y-6">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border-b border-gray-light dark:border-secondary pb-6 last:border-0"
            >
              <h3 className="text-lg font-medium text-secondary dark:text-alabaster mb-2">
                {faq.question}
              </h3>
              <p className="text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
