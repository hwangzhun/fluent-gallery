import { describe, expect, it } from 'vitest';
import { parsePhotoMetadata, parseTags } from './routes/ai';

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
  const available = ['城市', '夜景'];

  it('accepts a literary title up to 15 Unicode characters', () => {
    expect(parsePhotoMetadata('{"title":"灯火落在晚风里","tags":["城市","夜景","街头"]}', available)).toEqual({
      title: '灯火落在晚风里',
      tags: ['城市', '夜景', '街头'],
    });
    expect(parsePhotoMetadata(`{"title":"${'光'.repeat(15)}","tags":["城市","夜景","街头"]}`, available).title).toHaveLength(15);
  });

  it('rejects empty, overlong, quoted, malformed, or invalid-tag responses', () => {
    expect(() => parsePhotoMetadata('{"title":"","tags":["城市","夜景","街头"]}', available)).toThrow('15 字以内');
    expect(() => parsePhotoMetadata(`{"title":"${'光'.repeat(16)}","tags":["城市","夜景","街头"]}`, available)).toThrow('15 字以内');
    expect(() => parsePhotoMetadata('{"title":"《晚风》","tags":["城市","夜景","街头"]}', available)).toThrow('不含引号');
    expect(() => parsePhotoMetadata('{"title":"Evening Light","tags":["城市","夜景","街头"]}', available)).toThrow('中文');
    expect(() => parsePhotoMetadata('not json', available)).toThrow('JSON');
    expect(() => parsePhotoMetadata('{"title":"晚风","tags":["城市","街头","人像"]}', available)).toThrow('优先复用');
  });
});
