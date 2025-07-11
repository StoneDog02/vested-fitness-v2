import { useState, useEffect } from "react";
import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import Modal from "~/components/ui/Modal";
import Tooltip from "~/components/ui/Tooltip";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

// In-memory cache for user settings (expires after 30s)
const userSettingsCache: Record<string, { data: any; expires: number }> = {};

export const meta: MetaFunction = () => {
  return [
    { title: "Settings | Kava Training" },
    { name: "description", content: "Manage your account settings" },
  ];
};

type LoaderData = {
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    email_notifications?: boolean;
    app_notifications?: boolean;
    chat_bubble_color?: string;
  };
};

export const loader: LoaderFunction = async ({ request }) => {
  // Get user from auth cookie
  const cookies = parse(request.headers.get("cookie") || "");
  const supabaseAuthCookieKey = Object.keys(cookies).find(
    (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
  );
  
  let accessToken;
  if (supabaseAuthCookieKey) {
    try {
      const decoded = Buffer.from(
        cookies[supabaseAuthCookieKey],
        "base64"
      ).toString("utf-8");
      const [access] = JSON.parse(JSON.parse(decoded));
      accessToken = access;
    } catch (e) {
      accessToken = undefined;
    }
  }

  let authId: string | undefined;
  if (accessToken) {
    try {
      const decoded = jwt.decode(accessToken) as Record<string, unknown> | null;
      authId =
        decoded && typeof decoded === "object" && "sub" in decoded
          ? (decoded.sub as string)
          : undefined;
    } catch (e) {
      authId = undefined;
    }
  }

  if (!authId) {
    throw new Response("Unauthorized", { status: 401 });
  }

  // Check cache (per user)
  if (userSettingsCache[authId] && userSettingsCache[authId].expires > Date.now()) {
    return json(userSettingsCache[authId].data);
  }

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get user data
  const { data: user } = await supabase
    .from("users")
    .select("id, name, email, avatar_url, email_notifications, app_notifications, chat_bubble_color")
    .eq("auth_id", authId)
    .single();

  if (!user) {
    // Redirect to login if user not found
    return new Response(null, { status: 302, headers: { Location: "/auth/login" } });
  }

  const result = { user };
  // Cache result
  userSettingsCache[authId] = { data: result, expires: Date.now() + 30_000 };
  return json(result);
};

export default function Settings() {
  const { user } = useLoaderData<LoaderData>();
  const navigate = useNavigate();
  const profileFetcher = useFetcher();
  const passwordFetcher = useFetcher();
  const avatarFetcher = useFetcher();
  const deleteAccountFetcher = useFetcher();
  
  // Success popup state (same pattern as meals/workouts/supplements)
  const [showSuccess, setShowSuccess] = useState(false);
  
  // Delete account modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showFinalConfirmModal, setShowFinalConfirmModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  
  // Helper function to get initials from full name
  const getInitials = (fullName: string): string => {
    const nameParts = fullName.trim().split(' ');
    if (nameParts.length === 1) {
      return nameParts[0].charAt(0).toUpperCase();
    }
    // Get first letter of first name and first letter of last name
    const firstInitial = nameParts[0].charAt(0).toUpperCase();
    const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
    return firstInitial + lastInitial;
  };

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(user.email_notifications ?? true);
  const [appNotifications, setAppNotifications] = useState(user.app_notifications ?? true);
  const [chatBubbleColor, setChatBubbleColor] = useState(user.chat_bubble_color || "#e5e7eb");

  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const [commitment, setCommitment] = useState<{ count: number }>({ count: 0 });
  const [loadingCommitment, setLoadingCommitment] = useState(true);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCommitment() {
      setLoadingCommitment(true);
      setCommitmentError(null);
      try {
        const res = await fetch("/api/subscription-info");
        const data = await res.json();
        if (data && Array.isArray(data.billingHistory)) {
          const uniquePaidPeriods = new Set();
          const paidInvoices = data.billingHistory.filter((inv: any) =>
            inv.status === "paid" &&
            (inv.billing_reason === "subscription_cycle" || inv.billing_reason === "subscription_create") &&
            inv.lines && inv.lines.data && inv.lines.data[0] && inv.lines.data[0].period && inv.lines.data[0].period.end &&
            !uniquePaidPeriods.has(inv.lines.data[0].period.end) &&
            uniquePaidPeriods.add(inv.lines.data[0].period.end)
          );
          setCommitment({ count: paidInvoices.length });
        } else {
          setCommitment({ count: 0 });
        }
      } catch (err) {
        setCommitmentError("Could not load commitment progress.");
      } finally {
        setLoadingCommitment(false);
      }
    }
    fetchCommitment();
  }, []);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    profileFetcher.submit(
      {
        name,
        email,
        email_notifications: emailNotifications,
        app_notifications: appNotifications,
        chat_bubble_color: chatBubbleColor,
      },
      {
        method: "POST",
        action: "/api/update-profile",
        encType: "application/json",
      }
    );
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert("New passwords don't match");
      return;
    }
    passwordFetcher.submit(
      {
        currentPassword,
        newPassword,
      },
      {
        method: "POST",
        action: "/api/change-password",
        encType: "application/json",
      }
    );
  };

  const handleAvatarUpload = async (file: File) => {
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }
    
    if (!file.type.startsWith('image/')) {
      alert("Please select an image file");
      return;
    }
    
    setIsUploadingAvatar(true);
    
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        
        avatarFetcher.submit(
          JSON.stringify({
            imageData: base64,
            fileName: file.name,
            contentType: file.type,
          }),
          {
            method: "POST",
            action: "/api/upload-avatar",
            encType: "application/json",
          }
        );
      };
      reader.readAsDataURL(file);
    } catch (error) {
      alert("Failed to upload avatar");
      setIsUploadingAvatar(false);
    }
  };

  const handleDeleteAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletePassword.trim()) {
      alert("Please enter your password to confirm account deletion");
      return;
    }
    
    // Show final confirmation modal instead of immediately deleting
    setShowDeleteModal(false);
    setShowFinalConfirmModal(true);
  };

  const handleFinalDeleteConfirmation = () => {
    deleteAccountFetcher.submit(
      { password: deletePassword },
      {
        method: "DELETE",
        action: "/api/delete-account",
      }
    );
    setShowFinalConfirmModal(false);
  };

  // Handle successful responses
  useEffect(() => {
    if (profileFetcher.data && profileFetcher.state === "idle") {
      const data = profileFetcher.data as { success?: boolean; error?: string };
      if (data.success) {
        setShowSuccess(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setShowSuccess(false), 3000);
      } else if (data.error) {
        alert(data.error);
      }
    }
  }, [profileFetcher.data, profileFetcher.state]);
  
  useEffect(() => {
    if (passwordFetcher.data && passwordFetcher.state === "idle") {
      const data = passwordFetcher.data as { success?: boolean; error?: string };
      if (data.success) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowSuccess(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setShowSuccess(false), 3000);
      } else if (data.error) {
        alert(data.error);
      }
    }
  }, [passwordFetcher.data, passwordFetcher.state]);
  
  useEffect(() => {
    if (avatarFetcher.data && avatarFetcher.state === "idle") {
      setIsUploadingAvatar(false);
      const data = avatarFetcher.data as { success?: boolean; error?: string; avatar_url?: string };
      if (data.success) {
        if (data.avatar_url) {
          setAvatarUrl(data.avatar_url);
        }
        setShowSuccess(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setShowSuccess(false), 3000);
      } else if (data.error) {
        alert(data.error);
      }
    }
  }, [avatarFetcher.data, avatarFetcher.state]);

  // Handle delete account responses
  useEffect(() => {
    if (deleteAccountFetcher.data && deleteAccountFetcher.state === "idle") {
      const data = deleteAccountFetcher.data as { success?: boolean; error?: string };
      if (data.success) {
        // Account deleted successfully - redirect to home page
        navigate("/", { replace: true });
      } else if (data.error) {
        alert(data.error);
        setDeletePassword("");
      }
    }
  }, [deleteAccountFetcher.data, deleteAccountFetcher.state, navigate]);

  return (
    <div className="p-6">
      {/* Commitment Progress Banner (only for clients, less than 4 payments) */}
      {typeof window !== 'undefined' && window.location.pathname.includes('/dashboard/settings') && (
        loadingCommitment ? (
          <div className="bg-blue-100 text-blue-800 rounded px-4 py-2 text-sm font-medium mb-4">Loading commitment progress...</div>
        ) : commitmentError ? (
          <div className="bg-red-100 text-red-800 rounded px-4 py-2 text-sm font-medium mb-4">{commitmentError}</div>
        ) : (typeof commitment.count === "number" && commitment.count < 4) ? (
          <div className="bg-green-100 text-green-900 rounded px-4 py-2 text-sm font-medium mb-4">
            Commitment: {commitment.count} of 4 payments completed. You must complete 4 monthly payments before you can cancel your account.
          </div>
        ) : null
      )}
      {/* Success Message */}
      {showSuccess && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 bg-primary text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-fade-in">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>Profile Updated Successfully</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-secondary dark:text-alabaster">
          Settings
        </h1>
      </div>

      <div className="flex border-b border-gray-light dark:border-davyGray mb-6">
        <Link
          to="/dashboard/settings"
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-primary text-primary dark:text-primary"
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
          className="px-4 py-2 font-medium transition-colors duration-200 border-b-2 border-transparent text-gray-dark dark:text-primary hover:text-primary hover:border-primary/50 dark:hover:border-primary/50"
        >
          Terms & Conditions
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Information */}
        <Card title="Profile Information">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full border border-gray-light dark:border-davyGray rounded-md shadow-sm py-2 px-3 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-primary focus:border-primary"
                required
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full border border-gray-light dark:border-davyGray rounded-md shadow-sm py-2 px-3 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-primary focus:border-primary"
                required
              />
            </div>

            <div>
              <label
                htmlFor="profile-picture"
                className="block text-sm font-medium text-secondary mb-1"
              >
                Profile Picture
              </label>
              <div className="flex items-center">
                <div className="w-16 h-16 rounded-full bg-gray-light flex items-center justify-center text-gray-dark mr-4">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-xl">{getInitials(user.name)}</span>
                  )}
                </div>
                                  <input
                    id="profile-picture"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleAvatarUpload(file);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      document.getElementById("profile-picture")?.click()
                    }
                    disabled={isUploadingAvatar}
                  >
                    {isUploadingAvatar ? "Uploading..." : "Change Picture"}
                  </Button>
              </div>
            </div>

            <div>
              <Button 
                type="submit" 
                variant="primary"
                disabled={profileFetcher.state !== "idle"}
              >
                {profileFetcher.state !== "idle" ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Card>

        {/* Change Password */}
        <Card title="Change Password">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label
                htmlFor="current-password"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Current Password
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="block w-full border border-gray-light dark:border-davyGray rounded-md shadow-sm py-2 px-3 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-primary focus:border-primary"
                required
              />
            </div>

            <div>
              <label
                htmlFor="new-password"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="block w-full border border-gray-light dark:border-davyGray rounded-md shadow-sm py-2 px-3 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-primary focus:border-primary"
                required
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-1"
              >
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full border border-gray-light dark:border-davyGray rounded-md shadow-sm py-2 px-3 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-primary focus:border-primary"
                required
              />
            </div>

            <div>
              <Button 
                type="submit" 
                variant="primary"
                disabled={passwordFetcher.state !== "idle"}
              >
                {passwordFetcher.state !== "idle" ? "Changing..." : "Change Password"}
              </Button>
            </div>
          </form>
        </Card>

        {/* Chat Settings */}
        <Card title="Chat Settings">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label htmlFor="chat-bubble-color" className="block text-sm font-medium text-secondary dark:text-alabaster mb-1">
                Sent Message Bubble Color
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="chat-bubble-color"
                  type="color"
                  value={chatBubbleColor}
                  onChange={e => setChatBubbleColor(e.target.value)}
                  className="w-10 h-10 p-0 border-0 bg-transparent cursor-pointer"
                  style={{ background: "none" }}
                />
                <span className="text-sm">{chatBubbleColor}</span>
                <div className="ml-4">
                  <div
                    className="rounded-lg px-4 py-2 shadow text-sm"
                    style={{ background: chatBubbleColor, color: "#222", minWidth: 80, display: "inline-block" }}
                  >
                    Preview
                  </div>
                </div>
              </div>
            </div>
            <Button type="submit" variant="primary" disabled={profileFetcher.state !== "idle"}>
              {profileFetcher.state !== "idle" ? "Saving..." : "Save Chat Settings"}
            </Button>
          </form>
        </Card>

        {/* Account Security */}
        <Card title="Account Security" className="overflow-visible">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-secondary dark:text-alabaster mb-1">
                Two-Factor Authentication
              </h3>
              <p className="text-sm text-gray-dark dark:text-gray-light mb-2">
                Add an extra layer of security to your account
              </p>
              <Button variant="outline" size="sm">
                Enable 2FA
              </Button>
            </div>



            <div className="pt-4 border-t border-gray-light dark:border-davyGray">
              <h3 className="text-sm font-medium text-red-500 mb-1">
                Delete Account
              </h3>
              <p className="text-sm text-gray-dark dark:text-gray-light mb-2">
                Once you delete your account, there is no going back.
              </p>
              {typeof commitment.count === "number" && commitment.count < 4 ? (
                <Tooltip content="You must complete 4 monthly payments before you can cancel your account.">
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="text-red-500 border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-not-allowed"
                    >
                      Delete Account
                    </Button>
                  </span>
                </Tooltip>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteModal(true)}
                  className="text-red-500 border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Delete Account
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Notification Preferences */}
        <Card title="Notification Preferences">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-secondary dark:text-alabaster">
                    Email Notifications
                  </h3>
                  <p className="text-sm text-gray-dark dark:text-gray-light">
                    Receive emails about your account activity
                  </p>
                </div>
                <label
                  className="relative inline-flex items-center cursor-pointer"
                  htmlFor="email-notifications"
                >
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    id="email-notifications"
                  />
                  <div className="w-11 h-6 bg-gray-light dark:bg-davyGray peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  <span className="sr-only">Toggle email notifications</span>
                </label>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-secondary dark:text-alabaster">
                    App Notifications
                  </h3>
                  <p className="text-sm text-gray-dark dark:text-gray-light">
                    Receive notifications in the app
                  </p>
                </div>
                <label
                  className="relative inline-flex items-center cursor-pointer"
                  htmlFor="app-notifications"
                >
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={appNotifications}
                    onChange={(e) => setAppNotifications(e.target.checked)}
                    id="app-notifications"
                  />
                  <div className="w-11 h-6 bg-gray-light dark:bg-davyGray peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  <span className="sr-only">Toggle app notifications</span>
                </label>
              </div>
            </div>


          </div>
        </Card>
      </div>

      {/* Delete Account Password Confirmation Modal */}
      <Modal 
        isOpen={showDeleteModal} 
        onClose={() => {
          setShowDeleteModal(false);
          setDeletePassword("");
        }}
        title="Delete Account"
      >
        <div className="space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                  Warning: This action cannot be undone
                </h3>
                <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>
                    Deleting your account will permanently remove:
                  </p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Your profile and personal information</li>
                    <li>All workout plans and exercise history</li>
                    <li>All meal plans and nutrition tracking data</li>
                    <li>Supplement schedules and completion history</li>
                    <li>Weight logs and progress data</li>
                    <li>Coach messages and updates</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleDeleteAccount} className="space-y-4">
            <div>
              <label
                htmlFor="delete-password"
                className="block text-sm font-medium text-secondary dark:text-alabaster mb-2"
              >
                Enter your password to confirm account deletion:
              </label>
              <input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="block w-full border border-gray-light dark:border-davyGray rounded-md shadow-sm py-2 px-3 bg-white dark:bg-night text-secondary dark:text-alabaster focus:outline-none focus:ring-red-500 focus:border-red-500"
                placeholder="Enter your current password"
                required
                disabled={deleteAccountFetcher.state !== "idle"}
              />
            </div>

            <div className="flex justify-end space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword("");
                }}
                disabled={deleteAccountFetcher.state !== "idle"}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                disabled={deleteAccountFetcher.state !== "idle"}
              >
                {deleteAccountFetcher.state !== "idle" ? (
                  <div className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Deleting Account...
                  </div>
                ) : (
                  "Continue to Final Confirmation"
                )}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Final Delete Account Confirmation Modal */}
      <Modal 
        isOpen={showFinalConfirmModal} 
        onClose={() => {
          setShowFinalConfirmModal(false);
          setDeletePassword("");
        }}
        title="Final Confirmation"
      >
        <div className="space-y-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
              <svg
                className="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <div className="mt-3 text-center sm:mt-5">
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
                Are you absolutely sure?
              </h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This will permanently delete your account and all associated data. 
                  This action cannot be undone, recovered, or reversed.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="text-center">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Once you click "Yes, Delete Forever", your account will be immediately and permanently deleted.
              </p>
            </div>
          </div>

          <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:space-x-3 sm:justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowFinalConfirmModal(false);
                setDeletePassword("");
              }}
              disabled={deleteAccountFetcher.state !== "idle"}
              className="sm:w-auto"
            >
              Cancel - Keep My Account
            </Button>
            <Button
              type="button"
              onClick={handleFinalDeleteConfirmation}
              className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700 sm:w-auto"
              disabled={deleteAccountFetcher.state !== "idle"}
            >
              {deleteAccountFetcher.state !== "idle" ? (
                <div className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Deleting Forever...
                </div>
              ) : (
                "Yes, Delete Forever"
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
