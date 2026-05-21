// App composition — flow-ordered design canvas + tweaks panel

const { useState, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "catVariant": "storybook",
  "density": "normal"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const cv = tweaks.catVariant;
  const dens = tweaks.density;

  return (
    <>
      <SVGDefs />
      <DesignCanvas>
        {/* ===== MAIN FLOW (in lesson order) ===== */}
        <DCSection id="flow-1-pick" title="① 主流程 · 选课 (首页)">
          <DCArtboard id="flow-1-home" label="魔法书房 · 选一本咒语书" width={1280} height={800}>
            <HomeStudy variant="storybook" density="normal" />
          </DCArtboard>
        </DCSection>

        <DCSection id="flow-2-hello" title="② 主流程 · 进入课程 · 招呼 + 今日 12 词预告">
          <DCArtboard id="flow-2-intro" label="招呼帧" width={1280} height={800}>
            <IntroFrame variant="storybook" />
          </DCArtboard>
        </DCSection>

        <DCSection id="flow-3-practice" title="③ 主流程 · 逐词跟读 (× 12 词,4 个关键状态)">
          <DCArtboard id="practice-listening" label="听老师讲 (默认)" width={1280} height={800}>
            <LessonMandalaV2 variant="storybook" state="listening" />
          </DCArtboard>
          <DCArtboard id="practice-recording" label="跟读录音中 (按住 Space)" width={1280} height={800}>
            <LessonMandalaV2 variant="storybook" state="recording" />
          </DCArtboard>
          <DCArtboard id="practice-correct" label="说对了 · +1⭐" width={1280} height={800}>
            <LessonMandalaV2 variant="storybook" state="correct" />
          </DCArtboard>
          <DCArtboard id="practice-tryAgain" label="再试一次 (温柔)" width={1280} height={800}>
            <LessonMandalaV2 variant="storybook" state="tryAgain" />
          </DCArtboard>
        </DCSection>

        <DCSection id="flow-4-quiz" title="④ 主流程 · 12 词跟读完后 · 选词题 (默认 / 答对 / 答错)">
          <DCArtboard id="quiz-idle" label="选词题 · 默认" width={1280} height={800}>
            <QuizPickWordFrame variant="storybook" state="idle" />
          </DCArtboard>
          <DCArtboard id="quiz-correct" label="选词题 · 答对" width={1280} height={800}>
            <QuizPickWordFrame variant="storybook" state="correct" />
          </DCArtboard>
          <DCArtboard id="quiz-wrong" label="选词题 · 答错 (柔提示)" width={1280} height={800}>
            <QuizPickWordFrame variant="storybook" state="wrong" />
          </DCArtboard>
        </DCSection>

        <DCSection id="flow-5-review" title="⑤ 主流程 · 复习 · 句型填空">
          <DCArtboard id="review-empty" label="复习 · 待填空" width={1280} height={800}>
            <ReinforceFrame variant="storybook" filledWord={null} />
          </DCArtboard>
          <DCArtboard id="review-filled" label="复习 · 已说对" width={1280} height={800}>
            <ReinforceFrame variant="storybook" filledWord="peach" />
          </DCArtboard>
        </DCSection>

        <DCSection id="flow-6-done" title="⑥ 主流程 · 下课庆祝">
          <DCArtboard id="done" label="今天太棒啦!" width={1280} height={800}>
            <DoneCelebrateFrame variant="storybook" starsEarned={5} totalStars={5} />
          </DCArtboard>
        </DCSection>

        {/* ===== STANDALONE FEATURES ===== */}
        <DCSection id="stand-journal" title="独立 · 单词收藏 (魔法书)">
          <DCArtboard id="journal" label="翻开的魔法书" width={1280} height={800}>
            <JournalPage variant="storybook" density="normal" />
          </DCArtboard>
        </DCSection>

        <DCSection id="stand-parents" title="独立 · 家长阁楼 (先 PIN · 再数据)">
          <DCArtboard id="pin" label="PIN 解锁" width={1280} height={800}>
            <PINGateFrame variant="storybook" entered={2} />
          </DCArtboard>
          <DCArtboard id="parents" label="数据面板" width={1280} height={800}>
            <ParentsPage variant="storybook" density="normal" />
          </DCArtboard>
        </DCSection>

        {/* ===== DEV HANDOFF REFERENCE ===== */}
        <DCSection id="ref-cards" title="开发交付 · 词卡 / 句卡通用容器 (正方形图 · 上图下字)">
          <DCArtboard id="card-word" label="词卡 · kind = word" width={600} height={780}>
            <PaperBg tone="paper" style={{ width: 600, height: 780, padding: 40, boxSizing: 'border-box' }}>
              <HeroPictureCard
                card={{ kind: 'word', en: 'peach', zh: '桃子', ipa: '/piːtʃ/', emoji: '🍑', tone: 'peach' }}
                state="listening"
                stateStyles={{ borderColor: PALETTE.ink, glow: null, textColor: PALETTE.ink }}
              />
            </PaperBg>
          </DCArtboard>
          <DCArtboard id="card-sentence" label="句卡 · kind = sentence (英文小一号自动适配)" width={600} height={780}>
            <PaperBg tone="paper" style={{ width: 600, height: 780, padding: 40, boxSizing: 'border-box' }}>
              <HeroPictureCard
                card={{ kind: 'sentence', en: 'I like peach.', zh: '我喜欢桃子。', emoji: '🍑', tone: 'peach' }}
                state="listening"
                stateStyles={{ borderColor: PALETTE.ink, glow: null, textColor: PALETTE.ink }}
              />
            </PaperBg>
          </DCArtboard>
          <DCArtboard id="card-tile" label="Tile · quiz 选项 (正方形图 + 标签)" width={360} height={420}>
            <PaperBg tone="paper" style={{ width: 360, height: 420, padding: 30, boxSizing: 'border-box' }}>
              <TilePictureCard
                card={{ kind: 'word', en: 'peach', emoji: '🍑', tone: 'peach' }}
                state="listening"
                stateStyles={{ borderColor: PALETTE.ink, glow: null, textColor: PALETTE.ink }}
              />
            </PaperBg>
          </DCArtboard>
          <DCArtboard id="card-chip" label="Chip · 预览 / 词条" width={220} height={260}>
            <PaperBg tone="paper" style={{ width: 220, height: 260, padding: 20, boxSizing: 'border-box' }}>
              <ChipPictureCard
                card={{ kind: 'word', en: 'peach', emoji: '🍑', tone: 'peach' }}
                state="listening"
                stateStyles={{ borderColor: PALETTE.ink, glow: null, textColor: PALETTE.ink }}
              />
            </PaperBg>
          </DCArtboard>
        </DCSection>

        <DCSection id="ref-mascot" title="开发交付 · 主角 4 风格 (选定 storybook)">
          {[
            { v: 'storybook', name: CAT_NAMES.storybook, recommend: true },
            { v: 'chubbyQ',  name: CAT_NAMES.chubbyQ  },
            { v: 'papercut', name: CAT_NAMES.papercut },
            { v: 'inkline',  name: CAT_NAMES.inkline  },
          ].map((c) => (
            <DCArtboard key={c.v} id={'mascot-' + c.v} label={c.name + (c.recommend ? ' ★ 选定' : '')} width={300} height={380}>
              <PaperBg tone="paper" style={{ width: 300, height: 380 }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Cat variant={c.v} size={240} mood="idle" />
                </div>
                <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 18, color: PALETTE.ink }}>{c.name}</div>
              </PaperBg>
            </DCArtboard>
          ))}
        </DCSection>

        {/* ===== ALTERNATES (kept for reference, not main flow) ===== */}
        <DCSection id="alt" title="备选 · 其它探索方案 (不再推进)">
          <DCArtboard id="home-map" label="首页 · 学院地图" width={1280} height={800}>
            <HomeMap variant={cv} density={dens} />
          </DCArtboard>
          <DCArtboard id="home-wall" label="首页 · 信件墙" width={1280} height={800}>
            <HomeWall variant={cv} density={dens} />
          </DCArtboard>
          <DCArtboard id="lesson-scroll" label="Lesson · 卷轴" width={1280} height={800}>
            <LessonScroll variant={cv} density={dens} />
          </DCArtboard>
          <DCArtboard id="lesson-tower" label="Lesson · 学习之塔" width={1280} height={800}>
            <LessonTower variant={cv} density={dens} />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="陪伴的小猫">
          <TweakRadio
            label="角色"
            value={tweaks.catVariant}
            onChange={(v) => setTweak('catVariant', v)}
            options={[
              { value: 'storybook', label: '麻吉' },
              { value: 'chubbyQ',  label: '豆腐' },
              { value: 'papercut', label: '拍拍' },
              { value: 'inkline',  label: '露娜' },
            ]}
          />
          <div style={{ fontFamily: 'var(--font-zh)', fontSize: 12, color: PALETTE.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
            备选区里的小猫会跟着切。主流程区固定 = 麻吉。
          </div>
        </TweakSection>
        <TweakSection label="界面密度">
          <TweakRadio
            label="密度"
            value={tweaks.density}
            onChange={(v) => setTweak('density', v)}
            options={[
              { value: 'tight',  label: '紧凑' },
              { value: 'normal', label: '正常' },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
