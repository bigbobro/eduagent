import { Cat, PaperBg, PaperButton } from '@/components/magic';

export default function NotFound() {
  return (
    <PaperBg tone="paperDeep" className="h-screen w-screen">
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <Cat size={160} mood="happy" />
        <h1 className="font-display text-4xl text-ink">迷路啦</h1>
        <p className="font-zh text-lg text-inkSoft">这个页面不存在哦</p>
        <PaperButton color="butter">
          <a href="/">回魔法书房</a>
        </PaperButton>
      </div>
    </PaperBg>
  );
}
