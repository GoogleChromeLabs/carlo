/**
 * Copyright 2018 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

module.exports.addTests = function({testRunner, expect}) {

  const {describe, xdescribe, fdescribe} = testRunner;
  const {it, fit, xit} = testRunner;
  const {Color} = require('../lib/color');

  describe('color', () => {
    it('rgb1', async(state, test) => {
      color = Color.parse('rgb(94, 126, 91)');
      expect(color.asString(Color.Format.RGB)).toBe('rgb(94, 126, 91)');
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(94, 126, 91, 1)');
      expect(color.asString(Color.Format.HSL)).toBe('hsl(115, 16%, 43%)');
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(115, 16%, 43%, 1)');
      expect(color.asString(Color.Format.HEXA)).toBe('#5e7e5bff');
      expect(color.asString(Color.Format.HEX)).toBe('#5e7e5b');
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('rgb(94, 126, 91)');
    });
    it('rgb2', async(state, test) => {
      color = Color.parse('rgba(94 126 91)');
      expect(color.asString(Color.Format.RGB)).toBe('rgba(94 126 91)');
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(94, 126, 91, 1)');
      expect(color.asString(Color.Format.HSL)).toBe('hsl(115, 16%, 43%)');
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(115, 16%, 43%, 1)');
      expect(color.asString(Color.Format.HEXA)).toBe('#5e7e5bff');
      expect(color.asString(Color.Format.HEX)).toBe('#5e7e5b');
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('rgb(94, 126, 91)');
    });
    it('rgb3', async(state, test) => {
      color = Color.parse('rgba(94, 126, 91, 0.5)');
      expect(color.asString(Color.Format.RGB)).toBe(null);
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(94, 126, 91, 0.5)');
      expect(color.asString(Color.Format.HSL)).toBe(null);
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(115, 16%, 43%, 0.5)');
      expect(color.asString(Color.Format.HEXA)).toBe('#5e7e5b80');
      expect(color.asString(Color.Format.HEX)).toBe(null);
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('rgba(94, 126, 91, 0.5)');
    });
    it('rgb4', async(state, test) => {
      color = Color.parse('rgb(94 126 91 / 50%)');
      expect(color.asString(Color.Format.RGB)).toBe(null);
      expect(color.asString(Color.Format.RGBA)).toBe('rgb(94 126 91 / 50%)');
      expect(color.asString(Color.Format.HSL)).toBe(null);
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(115, 16%, 43%, 0.5)');
      expect(color.asString(Color.Format.HEXA)).toBe('#5e7e5b80');
      expect(color.asString(Color.Format.HEX)).toBe(null);
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('rgba(94, 126, 91, 0.5)');
    });
    it('hsl1', async(state, test) => {
      color = Color.parse('hsl(212, 55%, 32%)');
      expect(color.asString(Color.Format.RGB)).toBe('rgb(37, 79, 126)');
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(37, 79, 126, 1)');
      expect(color.asString(Color.Format.HSL)).toBe('hsl(212, 55%, 32%)');
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(212, 55%, 32%, 1)');
      expect(color.asString(Color.Format.HEXA)).toBe('#254f7eff');
      expect(color.asString(Color.Format.HEX)).toBe('#254f7e');
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('hsl(212, 55%, 32%)');
    });
    it('hsl2', async(state, test) => {
      color = Color.parse('hsla(212 55% 32%)');
      expect(color.asString(Color.Format.RGB)).toBe('rgb(37, 79, 126)');
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(37, 79, 126, 1)');
      expect(color.asString(Color.Format.HSL)).toBe('hsla(212 55% 32%)');
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(212, 55%, 32%, 1)');
      expect(color.asString(Color.Format.HEXA)).toBe('#254f7eff');
      expect(color.asString(Color.Format.HEX)).toBe('#254f7e');
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('hsl(212, 55%, 32%)');
    });
    it('hsl3', async(state, test) => {
      color = Color.parse('hsla(212, 55%, 32%, 0.5)');
      expect(color.asString(Color.Format.RGB)).toBe(null);
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(37, 79, 126, 0.5)');
      expect(color.asString(Color.Format.HSL)).toBe(null);
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(212, 55%, 32%, 0.5)');
      expect(color.asString(Color.Format.HEXA)).toBe('#254f7e80');
      expect(color.asString(Color.Format.HEX)).toBe(null);
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('hsla(212, 55%, 32%, 0.5)');
    });
    it('hsl4', async(state, test) => {
      color = Color.parse('hsla(212  55%  32% /  50%)');
      expect(color.asString(Color.Format.RGB)).toBe(null);
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(37, 79, 126, 0.5)');
      expect(color.asString(Color.Format.HSL)).toBe(null);
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(212  55%  32% /  50%)');
      expect(color.asString(Color.Format.HEXA)).toBe('#254f7e80');
      expect(color.asString(Color.Format.HEX)).toBe(null);
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('hsla(212, 55%, 32%, 0.5)');
    });
    it('hsl5', async(state, test) => {
      color = Color.parse('hsla(212deg 55% 32% / 50%)');
      expect(color.asString(Color.Format.RGB)).toBe(null);
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(37, 79, 126, 0.5)');
      expect(color.asString(Color.Format.HSL)).toBe(null);
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(212deg 55% 32% / 50%)');
      expect(color.asString(Color.Format.HEXA)).toBe('#254f7e80');
      expect(color.asString(Color.Format.HEX)).toBe(null);
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('hsla(212, 55%, 32%, 0.5)');
    });
    it('hex1', async(state, test) => {
      color = Color.parse('#12345678');
      expect(color.asString(Color.Format.RGB)).toBe(null);
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(18, 52, 86, 0.47058823529411764)');
      expect(color.asString(Color.Format.HSL)).toBe(null);
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(210, 65%, 20%, 0.47058823529411764)');
      expect(color.asString(Color.Format.HEXA)).toBe('#12345678');
      expect(color.asString(Color.Format.HEX)).toBe(null);
      expect(color.asString(Color.Format.ShortHEXA)).toBe(null);
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('#12345678');
    });
    it('hex2', async(state, test) => {
      color = Color.parse('#00FFFF');
      expect(color.asString(Color.Format.RGB)).toBe('rgb(0, 255, 255)');
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(0, 255, 255, 1)');
      expect(color.asString(Color.Format.HSL)).toBe('hsl(180, 100%, 50%)');
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(180, 100%, 50%, 1)');
      expect(color.asString(Color.Format.HEXA)).toBe('#00ffffff');
      expect(color.asString(Color.Format.HEX)).toBe('#00FFFF');
      expect(color.asString(Color.Format.ShortHEXA)).toBe('#0fff');
      expect(color.asString(Color.Format.ShortHEX)).toBe('#0ff');
      expect(color.asString()).toBe('#00ffff');
    });
    it('hex3', async(state, test) => {
      color = Color.parse('#1234');
      expect(color.asString(Color.Format.RGB)).toBe(null);
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(17, 34, 51, 0.26666666666666666)');
      expect(color.asString(Color.Format.HSL)).toBe(null);
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(210, 50%, 13%, 0.26666666666666666)');
      expect(color.asString(Color.Format.HEXA)).toBe('#11223344');
      expect(color.asString(Color.Format.HEX)).toBe(null);
      expect(color.asString(Color.Format.ShortHEXA)).toBe('#1234');
      expect(color.asString(Color.Format.ShortHEX)).toBe(null);
      expect(color.asString()).toBe('#1234');
    });
    it('hex4', async(state, test) => {
      color = Color.parse('#0FF');
      expect(color.asString(Color.Format.RGB)).toBe('rgb(0, 255, 255)');
      expect(color.asString(Color.Format.RGBA)).toBe('rgba(0, 255, 255, 1)');
      expect(color.asString(Color.Format.HSL)).toBe('hsl(180, 100%, 50%)');
      expect(color.asString(Color.Format.HSLA)).toBe('hsla(180, 100%, 50%, 1)');
      expect(color.asString(Color.Format.HEXA)).toBe('#00ffffff');
      expect(color.asString(Color.Format.HEX)).toBe('#00ffff');
      expect(color.asString(Color.Format.ShortHEXA)).toBe('#0fff');
      expect(color.asString(Color.Format.ShortHEX)).toBe('#0FF');
      expect(color.asString()).toBe('#0ff');
    });
  });

};
