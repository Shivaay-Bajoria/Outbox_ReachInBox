const ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'DIV', 'SPAN', 'A', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'PRE', 'CODE']);

/**
 * Allow-list sanitizer for rendering an email body: unknown elements are unwrapped (text kept),
 * all attributes are dropped except a safe http(s)/mailto href on links.
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((n) => n.remove());

  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      walk(child);
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      const href = child.tagName === 'A' ? child.getAttribute('href') : null;
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      if (href && /^(https?:|mailto:)/i.test(href.trim())) {
        child.setAttribute('href', href.trim());
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
