import ProjectBoardPage from "@/app/project/[projectId]/board/page";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProjectBoardPage params={{ projectId: id }} />;
}