import { notFound } from "next/navigation";
import { requireClient } from "@/lib/session";
import { Uploader } from "./Uploader";

const COPY = {
  branding: {
    title: "Send us your logos and brand files",
    help: "Logos, fonts, colors or a brand guide. Any file type works.",
  },
  content: {
    title: "Send us your photos and videos",
    help: "Your products, your space, your team. Phone photos are perfect.",
  },
};

export default async function UploadPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind !== "branding" && kind !== "content") notFound();
  const { agency, client } = await requireClient();
  return (
    <Uploader
      kind={kind}
      {...COPY[kind]}
      folder={`${agency.id}/${client.id}/${kind}`}
      brand={agency.brand}
      agencyName={agency.name}
    />
  );
}
