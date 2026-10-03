import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, handleOptions, jsonResponse, requireUser } from "../_shared/auth.ts";
import {
  detectDocumentKind,
  extractDocxText,
  extractPdfText,
  normalizeExtractedText,
} from "../../../src/services/documents/extract-text.ts";

Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const { documentId, filePath, fileName, fileType } = await req.json();

    if (!documentId || !filePath) {
      return jsonResponse({ error: "Missing documentId or filePath" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    await supabase
      .from("documents")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", documentId);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("course-documents")
      .download(filePath);

    if (downloadError || !fileData) {
      await supabase
        .from("documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      return jsonResponse({ error: "Failed to download file from storage" }, 500);
    }

    const name = fileName || filePath.split("/").pop() || "file";
    const type = fileType || "";
    const kind = detectDocumentKind(name, type);
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    let extractedText = "";

    if (kind === "txt" || kind === "md") {
      extractedText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } else if (kind === "pdf") {
      extractedText = await extractPdfText(bytes);
    } else if (kind === "docx") {
      extractedText = await extractDocxText(bytes);
    } else {
      try {
        extractedText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      } catch {
        extractedText = "";
      }
    }

    extractedText = normalizeExtractedText(extractedText);

    if (!extractedText) {
      await supabase
        .from("documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      return jsonResponse({
        error: "Could not extract text from file. For PDF/DOCX, ensure the file contains selectable text (not scanned images).",
        kind,
      }, 422);
    }

    const { error: updateError } = await supabase
      .from("documents")
      .update({
        extracted_text: extractedText,
        status: "indexed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (updateError) {
      return jsonResponse({ error: "Failed to save extracted text" }, 500);
    }

    return jsonResponse({
      success: true,
      documentId,
      kind,
      extractedTextPreview: extractedText.slice(0, 500),
      extractedTextLength: extractedText.length,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
