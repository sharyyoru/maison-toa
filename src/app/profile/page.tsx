import { useTranslations } from "next-intl";
import ProfileSettingsForm from "./ProfileSettingsForm";

export default function ProfilePage() {
  const t = useTranslations("profilePage");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
        <p className="text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>
      <ProfileSettingsForm />
    </div>
  );
}
