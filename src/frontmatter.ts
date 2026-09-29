/**
 * Obsidian only recognises a frontmatter block that opens at the very first
 * byte with `---` and closes with `---`, so that is the one rule this plugin
 * uses everywhere it has to reason about frontmatter itself.
 *
 * It matters because since Obsidian 1.5.5 `fileManager.processFrontMatter`
 * writes properties as plain body text when the file has no block yet
 * (forum.obsidian.md/t/filemanager-processfrontmatter-creates-plain-text-at-the-top-of-the-note-if-there-are-no-existing-properties/77008).
 * Delegating to it blindly is how a tag ends up in the note body instead of
 * in the YAML.
 */
export const FRONTMATTER_BLOCK = /^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function hasFrontmatter(content: string): boolean {
	return FRONTMATTER_BLOCK.test(content);
}

export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
	const match = FRONTMATTER_BLOCK.exec(content);
	return match
		? { frontmatter: match[0], body: content.slice(match[0].length) }
		: { frontmatter: "", body: content };
}

/**
 * Gives a file the empty, well formed block that processFrontMatter needs in
 * order to write into the YAML. Existing content is never touched, and the
 * line ending of the file is kept.
 */
export function withEmptyFrontmatter(content: string): string {
	if (hasFrontmatter(content)) return content;
	const eol = content.includes("\r\n") ? "\r\n" : "\n";
	return `---${eol}---${eol}${content}`;
}
