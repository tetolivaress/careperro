import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ToolLoader } from "@/components/shell/ToolLoader";
import { ToolPageFrame } from "@/components/shell/ToolPageFrame";
import { getCategory, getTool, tools } from "@/tools/registry";

export const dynamicParams = false;

export function generateStaticParams() {
  return tools.map((t) => ({ category: t.category, tool: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[category]/[tool]">): Promise<Metadata> {
  const { category, tool } = await params;
  const def = getTool(category, tool);
  if (!def) return {};
  return {
    title: def.name,
    description: `${def.description} Runs entirely in your browser; your files never leave your device.`,
  };
}

export default async function ToolPage({ params }: PageProps<"/[category]/[tool]">) {
  const { category, tool } = await params;
  const def = getTool(category, tool);
  const cat = getCategory(category);
  if (!def || !cat) notFound();

  return (
    <ToolPageFrame categorySlug={cat.slug} toolSlug={def.slug}>
      <ToolLoader category={cat.slug} slug={def.slug} />
    </ToolPageFrame>
  );
}
