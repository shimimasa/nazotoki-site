interface CharacterSelectProps {
  witnesses: { name: string; role: string }[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
}

export default function CharacterSelect({ witnesses, selectedIdx, onSelect }: CharacterSelectProps) {
  return (
    <div class="space-y-4">
      <div class="bg-white rounded-2xl border-2 border-purple-200 p-5">
        <div class="text-center mb-4">
          <p class="text-3xl mb-2">&#127917;</p>
          <h2 class="text-lg font-black text-gray-900">キャラクター選択</h2>
          <p class="text-sm text-gray-500 mt-1">なりきるキャラクターを選んでください</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          {witnesses.map((w, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              class={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedIdx === i
                  ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-300'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div class="flex items-center gap-2 mb-1">
                <div class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${
                  selectedIdx === i ? 'bg-purple-500 text-white' : 'bg-amber-100 text-amber-700'
                }`}>
                  {w.name.charAt(0)}
                </div>
                <span class="font-black text-gray-900 text-sm">{w.name}</span>
              </div>
              <p class="text-xs text-gray-500 line-clamp-2">{w.role}</p>
            </button>
          ))}
        </div>
        {selectedIdx !== null && (
          <div class="mt-4 bg-purple-50 rounded-xl p-3 text-center animate-fadeIn">
            <p class="text-sm font-bold text-purple-700">
              {witnesses[selectedIdx].name}の視点でプレイします
            </p>
            <p class="text-xs text-purple-500 mt-1">
              他のキャラの秘密は調査トークンで2人分だけ確認できます
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
