import { redirect } from "next/navigation";

export default function SettingsIndexPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  redirect(`/${locale}/settings/membership`);
}
