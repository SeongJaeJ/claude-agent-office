export function escapeHtml(str: string): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function simpleMarkdown(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^---$/gm, '<hr>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  html = html.replace(/^\|(.+)\|$/gm, (_match, content: string) => {
    const cells = content.split('|').map((c: string) => c.trim());
    if (cells.every((c: string) => /^[-:]+$/.test(c))) return '';
    const tag = cells.some((c: string) => /^[-:]+$/.test(c)) ? 'th' : 'td';
    return '<tr>' + cells.map((c: string) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
  });
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, '<table>$1</table>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/\n/g, '<br>');
  html = html.replace(/<br><h/g, '<h').replace(/<\/h(\d)><br>/g, '</h$1>');
  html = html.replace(/<br><pre>/g, '<pre>').replace(/<\/pre><br>/g, '</pre>');
  html = html.replace(/<br><ul>/g, '<ul>').replace(/<\/ul><br>/g, '</ul>');
  html = html.replace(/<br><hr>/g, '<hr>').replace(/<hr><br>/g, '<hr>');
  html = html.replace(/<br><table>/g, '<table>').replace(/<\/table><br>/g, '</table>');
  return html;
}
