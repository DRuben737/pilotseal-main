import TrainingGuideStudy from "@/components/dashboard/TrainingGuideStudy";

export const metadata = { title: "Training Guide" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { subjectId } = await params;
  const query = await searchParams;
  const value = (key: string) =>
    typeof query[key] === "string" ? query[key] : undefined;

  return (
    <TrainingGuideStudy
      subjectId={subjectId}
      preferredInstructorId={value("instructor")}
      preferredOrganizationId={value("organization")}
      returnTo={value("returnTo")}
    />
  );
}
