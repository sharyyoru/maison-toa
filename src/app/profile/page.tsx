import ProfileSettingsForm from "./ProfileSettingsForm";

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Your profile</h1>
        <p className="text-sm text-slate-500">
          Update your profile photo and the email signature used in outgoing
          communication.
        </p>
      </div>
      <ProfileSettingsForm />
    </div>
  );
}
