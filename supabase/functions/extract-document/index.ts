import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, handleOptions, jsonResponse, requireUser } from "../_shared/auth.ts";

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
    let extractedText = "";

    if (type.includes("text/plain") || type.includes("text/markdown") || name.endsWith(".txt") || name.endsWith(".md")) {
      extractedText = await fileData.text();
    } else if (type.includes("application/pdf") || name.endsWith(".pdf")) {
      const arrayBuffer = await fileData.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      // Prefer utf-8 decode of stream objects; fall back to latin1 scan for older PDFs
      let rawText = "";
      try {
        rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      } catch {
        rawText = new TextDecoder("latin1").decode(bytes);
      }
      const textChunks: string[] = [];
      const regex = /BT\s*([\s\S]*?)\s*ET/g;
      let match;
      while ((match = regex.exec(rawText)) !== null) {
        const block = match[1];
        const textRegex = /\(([^\\()]*(?:\\.[^\\()]*)*)\)\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
        let textMatch;
        while ((textMatch = textRegex.exec(block)) !== null) {
          const text = textMatch[1] || textMatch[2] || "";
          if (text) {
            textChunks.push(
              text
                .replace(/\\n/g, "\n")
                .replace(/\\r/g, "\r")
                .replace(/\\t/g, "\t")
                .replace(/\\\(/g, "(")
                .replace(/\\\)/g, ")")
                .replace(/\\\\/g, "\\")
                .replace(/^\((.*)\)$/, "$1"),
            );
          }
        }
      }
      extractedText = textChunks.join(" ").replace(/\s+/g, " ").trim();
      if (!extractedText) {
        const readable = rawText.match(/[\x20-\x7E\u0E00-\u0E7F]{4,}/g);
        if (readable) extractedText = readable.join(" ").trim();
      }
    } else if (type.includes("application/vnd.openxmlformats") || name.endsWith(".docx")) {
      const arrayBuffer = await fileData.arrayBuffer();
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(arrayBuffer));
      const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      const textChunks: string[] = [];
      let match;
      while ((match = textRegex.exec(rawText)) !== null) {
        if (match[1]) textChunks.push(match[1]);
      }
      extractedText = textChunks.join(" ").trim();
      if (!extractedText) {
        const readable = rawText.match(/[\x20-\x7E\u0E00-\u0E7F]{10,}/g);
        if (readable) extractedText = readable.join(" ").trim();
      }
    } else {
      try {
        extractedText = await fileData.text();
      } catch {
        extractedText = "";
      }
    }

    extractedText = extractedText.replace(/\x00/g, "").trim();
    if (extractedText.length > 50000) {
      extractedText = extractedText.slice(0, 50000) + "\n...[truncated]";
    }

    if (!extractedText) {
      await supabase
        .from("documents")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", documentId);
      return jsonResponse({
        error: "Could not extract text from file. For PDF/DOCX, ensure the file contains selectable text (not scanned images).",
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
      extractedTextPreview: extractedText.slice(0, 500),
      extractedTextLength: extractedText.length,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
