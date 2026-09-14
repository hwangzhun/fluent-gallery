import { describe, expect, it } from 'vitest';
import { buildTitlePrompt, parseTags, parseTitle } from './routes/ai';

describe('AI tag validation', () => {
  it('allows three new tags when the gallery has no existing tags', () => {
    expect(parseTags('{"tags":["城市","夜景","街头"]}', [])).toEqual(['城市', '夜景', '街头']);
  });

  it('allows two new tags when only one reusable tag exists', () => {
    expect(parseTags('{"tags":["风景","山川","云海"]}', ['风景'])).toEqual(['风景', '山川', '云海']);
  });

  it('requires two existing tags once the gallery has enough choices', () => {
    expect(() => parseTags('{"tags":["风景","山川","云海"]}', ['风景', '城市'])).toThrow('优先复用');
    expect(parseTags('{"tags":["风景","城市","云海"]}', ['风景', '城市'])).toEqual(['风景', '城市', '云海']);
  });
});

describe('AI photo metadata validation', () => {
  it('accepts a literary title up to 15 Unicode characters', () => {
    expect(parseTitle('{"title":"灯火落在晚风里"}')).toBe('灯火落在晚风里');
    expect(parseTitle(`{"title":"${'光'.repeat(15)}"}`)).toHaveLength(15);
  });

  it('rejects empty, overlong, quoted, English-only, or malformed responses', () => {
    expect(() => parseTitle('{"title":""}')).toThrow('15 字以内');
    expect(() => parseTitle(`{"title":"${'光'.repeat(16)}"}`)).toThrow('15 字以内');
    expect(() => parseTitle('{"title":"《晚风》"}')).toThrow('不含引号');
    expect(() => parseTitle('{"title":"Evening Light"}')).toThrow('中文');
    expect(() => parseTitle('not json')).toThrow('JSON');
  });

  it('keeps existing tags out of the title prompt', () => {
    const prompt = buildTitlePrompt();
    expect(prompt).not.toContain('已有标签');
    expect(prompt).not.toContain('优先复用');
    expect(prompt).not.toContain('城市');
  });

  it('combines independently validated title and tags into the metadata shape', () => {
    const metadata = {
      title: parseTitle('{"title":"灯火落在晚风里"}'),
      tags: parseTags('{"tags":["城市","夜景","街头"]}', ['城市', '夜景']),
    };
    expect(metadata).toEqual({ title: '灯火落在晚风里', tags: ['城市', '夜景', '街头'] });
  });
});
