import SteppedContent from '../SteppedContent';
import GmNote from '../GmNote';

interface IntroPhaseProps {
  commonHtml: string;
}

export default function IntroPhase({ commonHtml }: IntroPhaseProps) {
  return (
    <div class="space-y-4">
      <GmNote>
        <p class="text-sm text-indigo-800">
          {'\u4EE5\u4E0B\u306E\u300C\u5171\u901A\u60C5\u5831\u300D\u3092\u53C2\u52A0\u8005\u5168\u54E1\u306B\u8AAD\u307F\u4E0A\u3052\u3066\u304F\u3060\u3055\u3044\u3002'}
          {'\u30D7\u30ED\u30B8\u30A7\u30AF\u30BF\u30FC\u306B\u6295\u5F71\u3057\u3066\u3044\u308B\u5834\u5408\u306F\u3001\u4E00\u7DD2\u306B\u8AAD\u307F\u307E\u3057\u3087\u3046\u3002'}
        </p>
        <p class="text-sm text-indigo-700 mt-1">
          {'\u300C\u6B21\u3078\u300D\u30DC\u30BF\u30F3\u3067\u5C11\u3057\u305A\u3064\u8868\u793A\u3055\u308C\u307E\u3059\u3002\u8AAD\u307F\u4E0A\u3052\u306E\u30DA\u30FC\u30B9\u306B\u5408\u308F\u305B\u3066\u9032\u3081\u3066\u304F\u3060\u3055\u3044\u3002'}
        </p>
      </GmNote>

      <div class="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
        <SteppedContent html={commonHtml} />
      </div>
    </div>
  );
}
