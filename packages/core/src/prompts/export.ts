export function buildHtmlExportSystemPrompt(): string {
  return `You are a professional document designer specialising in investment materials. Generate a complete, self-contained HTML document styled as a formal investment memo.

Requirements:
- Complete HTML5 document with <!DOCTYPE html> and all required tags
- All CSS must be inline within a <style> tag in the <head> — no external stylesheets
- Professional typography: serif for headings, sans-serif for body
- Cover section with company name, deal type, and target audience
- Automated table of contents based on h2 headings
- Proper section hierarchy using h2 and h3
- Page break hints using CSS (page-break-before: always) before major sections
- Clean, print-friendly layout with appropriate margins
- Return ONLY the complete HTML document — no markdown fences, no commentary`;
}

export function buildHtmlExportUserMessage(
  memoContent: string,
  briefData: {
    companyName: string;
    dealType: string;
    targetAudience: string;
  }
): string {
  return `Document metadata:
Company: ${briefData.companyName}
Deal type: ${briefData.dealType}
Target audience: ${briefData.targetAudience}

Investment memo content:
${memoContent}

Generate a complete HTML document.`;
}
