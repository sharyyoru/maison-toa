import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (geminiApiKey) {
  genAI = new GoogleGenerativeAI(geminiApiKey);
}

type TemplateVariable = {
  category?: string;
  path: string;
  label?: string;
};

type GenerateEmailRequestBody = {
  description?: string;
  tone?: string;
  variables?: TemplateVariable[];
};

// Convert a paragraph object to Unlayer text block
function createTextBlock(text: string): object {
  return {
    type: "text",
    values: {
      containerPadding: "10px",
      anchor: "",
      textAlign: "left",
      lineHeight: "140%",
      linkStyle: {
        inherit: true,
        linkColor: "#0000ee",
        linkHoverColor: "#0000ee",
        linkUnderline: true,
        linkHoverUnderline: true,
      },
      _meta: {
        htmlID: `u_content_text_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        htmlClassNames: "u_content_text",
      },
      selectable: true,
      draggable: true,
      duplicatable: true,
      deletable: true,
      hideable: true,
      text: text,
    },
  };
}

// Create an Unlayer design from structured paragraphs
function createUnlayerDesign(paragraphs: string[]): object {
  const contents = paragraphs.map((p) => createTextBlock(p));
  
  return {
    counters: { u_row: 1, u_column: 1, u_content_text: paragraphs.length },
    body: {
      id: "body",
      rows: [
        {
          id: "row_1",
          cells: [1],
          columns: [
            {
              id: "col_1",
              contents: contents,
              values: {
                _meta: { htmlID: "u_column_1", htmlClassNames: "u_column" },
              },
            },
          ],
          values: {
            displayCondition: null,
            columns: false,
            backgroundColor: "",
            columnsBackgroundColor: "",
            backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
            padding: "0px",
            anchor: "",
            hideDesktop: false,
            _meta: { htmlID: "u_row_1", htmlClassNames: "u_row" },
            selectable: true,
            draggable: true,
            duplicatable: true,
            deletable: true,
            hideable: true,
          },
        },
      ],
      values: {
        popupPosition: "center",
        popupWidth: "600px",
        popupHeight: "auto",
        borderRadius: "10px",
        contentAlign: "center",
        contentVerticalAlign: "center",
        contentWidth: "600px",
        fontFamily: { label: "Arial", value: "arial,helvetica,sans-serif" },
        textColor: "#000000",
        popupBackgroundColor: "#FFFFFF",
        popupBackgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "cover", position: "center" },
        popupOverlay_backgroundColor: "rgba(0, 0, 0, 0.1)",
        popupCloseButton_position: "top-right",
        popupCloseButton_backgroundColor: "#DDDDDD",
        popupCloseButton_iconColor: "#000000",
        popupCloseButton_borderRadius: "0px",
        popupCloseButton_margin: "0px",
        popupCloseButton_action: { name: "close_popup", attrs: { onClick: "document.querySelector('.u-popup-container').style.display = 'none';" } },
        backgroundColor: "#ffffff",
        backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
        preheaderText: "",
        linkStyle: { body: true, linkColor: "#0000ee", linkHoverColor: "#0000ee", linkUnderline: true, linkHoverUnderline: true },
        _meta: { htmlID: "u_body", htmlClassNames: "u_body" },
      },
    },
  };
}

export async function POST(request: Request) {
  try {
    if (!genAI) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY environment variable" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as GenerateEmailRequestBody;
    const description = (body.description || "").trim();
    const tone = (body.tone || "professional and reassuring").trim();
    const variables = body.variables || [];

    if (!description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 },
      );
    }

    const variableList =
      variables.length === 0
        ? "None."
        : variables
            .map((v) => {
              const label = v.label || v.path;
              const category = v.category ? `${v.category}: ` : "";
              return `- ${category}{{${v.path}}} — ${label}`;
            })
            .join("\n");

    const systemPrompt =
      "You are an expert email copywriter for Aesthetics Clinic. You generate clear, concise, empathetic emails for patients. Always output strict JSON.";

    const userPrompt = `
Write a patient-facing email for a medical clinic workflow.

Goal / context:
${description}

Tone: ${tone}.

You can use these template variables (MUST keep the {{variable.path}} syntax exactly when you use them):
${variableList}

Requirements:
- Output STRICT JSON only, no markdown, with shape: {"subject": string, "paragraphs": string[]}.
- Each paragraph in the array should be a single HTML string for that paragraph (can include <strong>, <em>, <br>, inline styles).
- Use simple HTML formatting like <strong>bold</strong>, <em>italic</em>, <br> for line breaks within a paragraph.
- For bullet lists, create ONE paragraph containing a <ul> with <li> items.
- When you reference a variable, use it verbatim like {{patient.first_name}}.
- Do not invent new variables that are not in the list above.
- The subject should be short, specific, and appropriate for the email.
- Keep paragraphs concise and well-structured.

Example output:
{"subject": "Your Appointment Confirmation", "paragraphs": ["<p>Dear {{patient.first_name}},</p>", "<p>We're excited to confirm your upcoming appointment.</p>", "<p><strong>Date:</strong> {{appointment.date}}<br><strong>Time:</strong> {{appointment.time}}</p>", "<p>We look forward to seeing you!</p>", "<p>Best regards,<br>The {{clinic.name}} Team</p>"]}
`;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.7 },
    });

    const rawContent = result.response.text() || "";

    let subject = "Clinic update";
    let paragraphs: string[] = ["<p>Thank you for your message.</p>"];
    let design: object | null = null;

    try {
      // Remove markdown code blocks if present
      const cleanedContent = rawContent.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleanedContent) as { subject?: string; paragraphs?: string[]; html?: string };
      
      if (parsed.subject && parsed.subject.trim().length > 0) {
        subject = parsed.subject.trim();
      }
      
      if (parsed.paragraphs && Array.isArray(parsed.paragraphs) && parsed.paragraphs.length > 0) {
        paragraphs = parsed.paragraphs.map((p) => {
          // Ensure each paragraph is wrapped in <p> if not already
          const trimmed = p.trim();
          if (!trimmed.startsWith("<p>") && !trimmed.startsWith("<ul>") && !trimmed.startsWith("<ol>")) {
            return `<p>${trimmed}</p>`;
          }
          return trimmed;
        });
      } else if (parsed.html && parsed.html.trim().length > 0) {
        // Fallback: if AI returns html instead of paragraphs, split by </p> or use as single paragraph
        const htmlContent = parsed.html.trim();
        const matches = htmlContent.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
        if (matches && matches.length > 0) {
          paragraphs = matches;
        } else {
          paragraphs = [`<p>${htmlContent}</p>`];
        }
      }
      
      design = createUnlayerDesign(paragraphs);
    } catch {
      if (rawContent.trim().length > 0) {
        paragraphs = [`<p>${rawContent.trim()}</p>`];
      }
      design = createUnlayerDesign(paragraphs);
    }

    // Also return html for backwards compatibility
    const html = paragraphs.join("\n");

    return NextResponse.json({ subject, html, design, paragraphs });
  } catch (error) {
    console.error("Error generating workflow email via Gemini", error);
    return NextResponse.json(
      { error: "Failed to generate email" },
      { status: 500 },
    );
  }
}
