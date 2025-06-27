import { useState, useEffect } from "react";
import type { MetaFunction, LoaderFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useFetcher } from "@remix-run/react";
import Card from "~/components/ui/Card";
import Button from "~/components/ui/Button";
import ThemeToggle from "~/components/ui/ThemeToggle";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";
import { parse } from "cookie";
import jwt from "jsonwebtoken";
import { Buffer } from "buffer";

export const meta: MetaFunction = () => {
  return [
    { title: "Settings | Vested Fitness" },
    { name: "description", content: "Manage your account settings" },
  ];
};

type LoaderData = {
  user: {
    id: string;
    name: string;
    email: string;
    avatar_url?: string;
    font_size?: string;
    email_notifications?: boolean;
    app_notifications?: boolean;
    weekly_summary?: boolean;
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

  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Get user data
  const { data: user, error } = await supabase
    .from("users")
    .select("id, name, email, avatar_url, font_size, email_notifications, app_notifications, weekly_summary")
    .eq("auth_id", authId)
    .single();

  if (error || !user) {
    throw new Response("User not found", { status: 404 });
  }

  return json({ user });
};

export default function Settings() {
  const { user } = useLoaderData<LoaderData>();
  const profileFetcher = useFetcher();
  const passwordFetcher = useFetcher();
  const avatarFetcher = useFetcher();
  
  // Success popup state (same pattern as meals/workouts/supplements)
  const [showSuccess, setShowSuccess] = useState(false);
  
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
  const [fontSize, setFontSize] = useState(user.font_size || "medium");
  const [emailNotifications, setEmailNotifications] = useState(user.email_notifications ?? true);
  const [appNotifications, setAppNotifications] = useState(user.app_notifications ?? true);
  const [weeklySummary, setWeeklySummary] = useState(user.weekly_summary ?? true);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    profileFetcher.submit(
      {
        name,
        email,
        font_size: fontSize,
        email_notifications: emailNotifications,
        app_notifications: appNotifications,
        weekly_summary: weeklySummary,
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

  return (
    <div className="p-6">
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

        {/* Appearance */}
        <Card title="Appearance">
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-secondary dark:text-alabaster mb-1">
                Theme
              </h3>
              <p className="text-sm text-gray-dark dark:text-gray-light mb-4">
                Choose between light and dark mode for your dashboard
              </p>
              <div className="flex items-center justify-between p-4 border border-gray-light dark:border-davyGray rounded-md">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white border border-gray-light flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-night"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-night border border-davyGray flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-alabaster"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                    </svg>
                  </div>
                </div>
                <ThemeToggle />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-secondary dark:text-alabaster mb-1">
                Font Size
              </h3>
              <p className="text-sm text-gray-dark dark:text-gray-light mb-2">
                Adjust the size of text throughout the application
              </p>
              <div className="flex items-center space-x-2">
                <Button 
                  variant={fontSize === "small" ? "primary" : "outline"} 
                  size="sm"
                  type="button"
                  onClick={() => setFontSize("small")}
                >
                  Small
                </Button>
                <Button 
                  variant={fontSize === "medium" ? "primary" : "outline"} 
                  size="sm"
                  type="button"
                  onClick={() => setFontSize("medium")}
                >
                  Medium
                </Button>
                <Button 
                  variant={fontSize === "large" ? "primary" : "outline"} 
                  size="sm"
                  type="button"
                  onClick={() => setFontSize("large")}
                >
                  Large
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Account Security */}
        <Card title="Account Security">
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

            <div>
              <h3 className="text-sm font-medium text-secondary dark:text-alabaster mb-1">
                Connected Applications
              </h3>
              <p className="text-sm text-gray-dark dark:text-gray-light mb-2">
                Manage apps that have access to your account
              </p>
              <Button variant="outline" size="sm">
                Manage Applications
              </Button>
            </div>

            <div className="pt-4 border-t border-gray-light dark:border-davyGray">
              <h3 className="text-sm font-medium text-red-500 mb-1">
                Delete Account
              </h3>
              <p className="text-sm text-gray-dark dark:text-gray-light mb-2">
                Once you delete your account, there is no going back.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Delete Account
              </Button>
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

            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-secondary dark:text-alabaster">
                    Weekly Progress Summary
                  </h3>
                  <p className="text-sm text-gray-dark dark:text-gray-light">
                    Receive a weekly email with your progress summary
                  </p>
                </div>
                <label
                  className="relative inline-flex items-center cursor-pointer"
                  htmlFor="weekly-summary"
                >
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={weeklySummary}
                    onChange={(e) => setWeeklySummary(e.target.checked)}
                    id="weekly-summary"
                  />
                  <div className="w-11 h-6 bg-gray-light dark:bg-davyGray peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  <span className="sr-only">
                    Toggle weekly progress summary
                  </span>
                </label>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
