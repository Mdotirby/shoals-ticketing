import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `
You are an expert venue seating diagram analyzer.
Your job is to extract sections, rows, seats, and tables from diagrams.

Rules:
- Detect sections, rows, seats, and tables.
- Row seating should include: section name, row label, seat count.
- Table seating should include: table label, seat count.
- Circular seat clusters should be detected as tables.
- Do NOT generate pricing information.
- Only extract seating structure.
- If you cannot identify specific details, make reasonable estimates based on the diagram layout.

Return ONLY JSON in this exact format:
{
  "sections": [
    {
      "name": "Orchestra",
      "type": "rows",
      "rows": [
        {"row": "A", "seats": 18},
        {"row": "B", "seats": 18}
      ]
    },
    {
      "name": "VIP",
      "type": "tables",
      "tables": [
        {"table": "T1", "seats": 4},
        {"table": "T2", "seats": 6}
      ]
    }
  ]
}

Never include explanations.
Never estimate seats unless seat markers are visible.
Return JSON only.
`;

/**
 * POST /api/seating/analyze-diagram
 * Sends a diagram image URL to Claude Vision to extract seating layout structure.
 * Body: { image_url: string, venue_id?: string }
 * Returns: structured JSON with sections, rows, tables, seats
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { image_url } = body;

    if (!image_url) {
      return NextResponse.json({ error: "image_url is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured. Set ANTHROPIC_API_KEY in environment variables." },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({
      apiKey,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "url",
                url: image_url,
              },
            },
            {
              type: "text",
              text: "Analyze this seating chart and return the seating structure.",
            },
          ],
        },
      ],
    });

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "AI returned no text response." },
        { status: 422 }
      );
    }

    const content = textBlock.text;

    // Extract JSON from the response (may be wrapped in markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse Claude response as JSON:", content);
      return NextResponse.json(
        { error: "AI returned invalid JSON. Please try a clearer diagram." },
        { status: 422 }
      );
    }

    // Validate structure
    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      return NextResponse.json(
        { error: "AI response missing sections array." },
        { status: 422 }
      );
    }

    // Calculate summary metrics
    const totalSections = parsed.sections.length;
    let totalRows = 0;
    let totalTables = 0;
    let totalSeats = 0;

    for (const section of parsed.sections) {
      if (section.type === "rows" && Array.isArray(section.rows)) {
        totalRows += section.rows.length;
        totalSeats += section.rows.reduce((sum: number, r: { seats: number }) => sum + (r.seats || 0), 0);
      }
      if (section.type === "tables" && Array.isArray(section.tables)) {
        totalTables += section.tables.length;
        totalSeats += section.tables.reduce((sum: number, t: { seats: number }) => sum + (t.seats || 0), 0);
      }
    }

    return NextResponse.json({
      ...parsed,
      summary: {
        total_sections: totalSections,
        total_rows: totalRows,
        total_tables: totalTables,
        total_seats: totalSeats,
      },
    });
  } catch (err) {
    console.error("Analyze diagram error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
