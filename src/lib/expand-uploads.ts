import JSZip from "jszip";
import { inferDocKind, type PackDocKind } from "@/lib/pack-utils";

const DOC_EXT = /\.(pdf|docx?|txt|md)$/i;
const SKIP_PATH = /(^|\/)(\.DS_Store|__MACOSX|Thumbs\.db)(\/|$)/i;

export type ExpandedUpload = {
  file: File;
  /** Path inside the pack (folders preserved), without the ZIP filename prefix */
  sourcePath: string;
  /** ZIP filename, or "direct" for loose uploads */
  packLabel: string;
  docKind: PackDocKind;
};

function isZip(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

function basename(path: string) {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function normalizeEntryPath(entryName: string) {
  return entryName.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function mimeForName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

/**
 * Expand user uploads for tender / bidder packs.
 * - Plain PDF/DOCX/TXT → returned as-is
 * - ZIP → extract nested document files, preserving folder paths
 */
export async function expandUploads(
  files: File[],
  opts?: { maxFiles?: number; maxFileBytes?: number },
): Promise<ExpandedUpload[]> {
  const maxFiles = opts?.maxFiles ?? 40;
  const maxFileBytes = opts?.maxFileBytes ?? 20 * 1024 * 1024;
  const out: ExpandedUpload[] = [];

  for (const file of files) {
    if (!isZip(file)) {
      if (!DOC_EXT.test(file.name)) {
        throw new Error(`Unsupported file type: ${file.name}`);
      }
      if (file.size > maxFileBytes) {
        throw new Error(`${file.name} exceeds ${(maxFileBytes / (1024 * 1024)).toFixed(0)} MB`);
      }
      const sourcePath = file.name;
      out.push({
        file,
        sourcePath,
        packLabel: "direct",
        docKind: inferDocKind(file.name, sourcePath),
      });
      continue;
    }

    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter((e) => !e.dir);
    let extracted = 0;

    for (const entry of entries) {
      if (SKIP_PATH.test(entry.name)) continue;
      const sourcePath = normalizeEntryPath(entry.name);
      const name = basename(sourcePath);
      if (!DOC_EXT.test(name)) continue;
      if (out.length >= maxFiles) {
        throw new Error(`Too many documents (max ${maxFiles}). Split the pack or remove annexes.`);
      }
      const blob = await entry.async("blob");
      if (blob.size > maxFileBytes) {
        throw new Error(`${name} inside ZIP exceeds ${(maxFileBytes / (1024 * 1024)).toFixed(0)} MB`);
      }
      if (blob.size === 0) continue;
      const expanded = new File([blob], name, { type: mimeForName(name) });
      out.push({
        file: expanded,
        sourcePath,
        packLabel: file.name,
        docKind: inferDocKind(name, sourcePath),
      });
      extracted++;
    }

    if (extracted === 0) {
      throw new Error(
        `${file.name} has no usable PDF/DOCX/TXT files. Check the ZIP contents.`,
      );
    }
  }

  if (!out.length) throw new Error("No documents found to upload");
  return out;
}

export function isZipFile(file: File) {
  return isZip(file);
}
