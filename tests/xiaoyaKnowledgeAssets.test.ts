import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import matter from 'gray-matter';

const KNOWLEDGE_ROOT = path.join(process.cwd(), 'content', 'xiaoya');
const GOLDEN_PATH = path.join(process.cwd(), 'tests', 'fixtures', 'xiaoya-golden.json');

const REQUIRED_FRONTMATTER = [
  'id',
  'title',
  'summary',
  'category',
  'pageTypes',
  'keywords',
  'priority',
  'updatedAt',
  'locale',
] as const;

const CANONICAL_PAGE_TYPES = new Set([
  'global',
  'home',
  'forest-about',
  'creator-directory',
  'creator-profile',
  'creator-profile-edit',
  'work-editor',
  'share-gallery',
  'share-submission',
  'meditation-grove',
  'meditation-category',
  'phil-coach',
  'login',
  'launch-announcement',
  'unknown',
]);

function listMarkdownFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [fullPath] : [];
  });
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') {
    assert.fail(`${label} must be a string`);
  }
  assert.ok(value.trim(), `${label} must not be empty`);
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(value.length > 0, `${label} must not be empty`);
  for (const [index, item] of value.entries()) {
    assertNonEmptyString(item, `${label}[${index}]`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('小芽静态知识库至少有 16 篇且 frontmatter 完整', () => {
  assert.ok(fs.existsSync(KNOWLEDGE_ROOT), 'content/xiaoya must exist');
  const files = listMarkdownFiles(KNOWLEDGE_ROOT);
  assert.ok(files.length >= 16, `expected at least 16 knowledge documents, got ${files.length}`);

  for (const file of files) {
    const relative = path.relative(process.cwd(), file);
    const parsed = matter(fs.readFileSync(file, 'utf8'));

    for (const field of REQUIRED_FRONTMATTER) {
      assert.notEqual(parsed.data[field], undefined, `${relative} is missing frontmatter.${field}`);
    }

    assertNonEmptyString(parsed.data.id, `${relative}.id`);
    assertNonEmptyString(parsed.data.title, `${relative}.title`);
    assertNonEmptyString(parsed.data.summary, `${relative}.summary`);
    assertNonEmptyString(parsed.data.category, `${relative}.category`);
    assertNonEmptyString(parsed.data.locale, `${relative}.locale`);
    assertStringArray(parsed.data.pageTypes, `${relative}.pageTypes`);
    assertStringArray(parsed.data.keywords, `${relative}.keywords`);
    assert.equal(typeof parsed.data.priority, 'number', `${relative}.priority must be a number`);
    assert.ok(Number.isFinite(parsed.data.priority), `${relative}.priority must be finite`);

    const updatedAt = parsed.data.updatedAt;
    const validDate = updatedAt instanceof Date
      ? !Number.isNaN(updatedAt.getTime())
      : typeof updatedAt === 'string' && !Number.isNaN(Date.parse(updatedAt));
    assert.ok(validDate, `${relative}.updatedAt must be a valid date`);
    assert.ok(parsed.content.trim(), `${relative} must have a non-empty body`);
  }
});

test('小芽知识文档 ID 唯一且只使用 canonical pageTypes', () => {
  const files = listMarkdownFiles(KNOWLEDGE_ROOT);
  const seenIds = new Set<string>();

  for (const file of files) {
    const relative = path.relative(process.cwd(), file);
    const data = matter(fs.readFileSync(file, 'utf8')).data;
    assertNonEmptyString(data.id, `${relative}.id`);
    assert.ok(!seenIds.has(data.id), `duplicate knowledge id: ${data.id}`);
    seenIds.add(data.id);

    assertStringArray(data.pageTypes, `${relative}.pageTypes`);
    for (const pageType of data.pageTypes) {
      assert.ok(
        CANONICAL_PAGE_TYPES.has(pageType),
        `${relative} uses non-canonical pageType: ${pageType}`,
      );
    }
  }
});

test('黄金问题至少 40 条，ID 唯一且字段类型正确', () => {
  const parsed: unknown = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  assert.ok(Array.isArray(parsed), 'xiaoya-golden.json must contain an array');
  assert.ok(parsed.length >= 40, `expected at least 40 golden questions, got ${parsed.length}`);

  const seenIds = new Set<string>();
  for (const [index, item] of parsed.entries()) {
    assert.ok(isRecord(item), `golden[${index}] must be an object`);
    assertNonEmptyString(item.id, `golden[${index}].id`);
    assertNonEmptyString(item.question, `golden[${index}].question`);
    assertNonEmptyString(item.expectedIntent, `golden[${index}].expectedIntent`);
    assert.ok(!seenIds.has(item.id), `duplicate golden id: ${item.id}`);
    seenIds.add(item.id);

    if (item.pageType !== undefined) {
      assertNonEmptyString(item.pageType, `golden[${index}].pageType`);
      assert.ok(
        CANONICAL_PAGE_TYPES.has(item.pageType),
        `golden[${index}] uses non-canonical pageType: ${item.pageType}`,
      );
    }

    for (const field of ['mustMention', 'mustNotMention'] as const) {
      if (item[field] !== undefined) {
        assertStringArray(item[field], `golden[${index}].${field}`);
      }
    }
  }
});
