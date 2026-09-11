import { describe, expect, it } from 'vitest';
import { parseTags } from './routes/ai';

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
