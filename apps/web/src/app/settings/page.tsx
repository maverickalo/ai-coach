"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LogOut, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { coachApi } from "@/lib/api";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { ProfileUpdate } from "@/lib/types";

const emptyProfile: ProfileUpdate = {
  displayName: "",
  timezone: "America/Los_Angeles",
  phoneNumber: "",
  primaryGoal: "",
  equipmentNotes: "",
  injuryNotes: ""
};

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileUpdate>(emptyProfile);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    coachApi
      .profile()
      .then((result) => {
        if (!active) {
          return;
        }
        setEmail(result.email ?? "");
        setProfile({
          displayName: result.displayName ?? "",
          timezone: result.timezone,
          phoneNumber: result.phoneNumber ?? "",
          primaryGoal: result.primaryGoal ?? "",
          equipmentNotes: result.equipmentNotes ?? "",
          injuryNotes: result.injuryNotes ?? ""
        });
      })
      .catch((error) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "Unable to load profile"
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  function field<K extends keyof ProfileUpdate>(
    key: K,
    value: ProfileUpdate[K]
  ) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await coachApi.updateProfile(profile);
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <AppShell title="Settings" subtitle={email || "Coach profile"}>
      {loading ? (
        <div className="settings-skeleton" />
      ) : (
        <form className="settings-form" onSubmit={save}>
          <label>
            <span>Name</span>
            <input
              value={profile.displayName}
              onChange={(event) => field("displayName", event.target.value)}
              required
            />
          </label>

          <label>
            <span>Timezone</span>
            <select
              value={profile.timezone}
              onChange={(event) => field("timezone", event.target.value)}
            >
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="America/Denver">Mountain Time</option>
              <option value="America/Chicago">Central Time</option>
              <option value="America/New_York">Eastern Time</option>
            </select>
          </label>

          <label>
            <span>Phone number</span>
            <input
              type="tel"
              inputMode="tel"
              value={profile.phoneNumber}
              onChange={(event) => field("phoneNumber", event.target.value)}
              placeholder="+1"
            />
          </label>

          <label>
            <span>Goal</span>
            <textarea
              rows={3}
              value={profile.primaryGoal}
              onChange={(event) => field("primaryGoal", event.target.value)}
            />
          </label>

          <label>
            <span>Equipment notes</span>
            <textarea
              rows={4}
              value={profile.equipmentNotes}
              onChange={(event) => field("equipmentNotes", event.target.value)}
            />
          </label>

          <label>
            <span>Injury notes</span>
            <textarea
              rows={4}
              value={profile.injuryNotes}
              onChange={(event) => field("injuryNotes", event.target.value)}
            />
          </label>

          <button className="primary-button settings-save" type="submit" disabled={saving}>
            <Save size={18} />
            {saving ? "Saving..." : "Save"}
          </button>
          {message ? <p className="save-message" role="status">{message}</p> : null}

          <button className="sign-out-button" type="button" onClick={signOut}>
            <LogOut size={18} />
            Sign out
          </button>
        </form>
      )}
    </AppShell>
  );
}
