import Link from 'next/link';

export default function ShellSpikePage() {
  return (
    <main className="p0-material-preview">
      <section className="p0-glass-panel">
        <p className="p0-eyebrow">EduAgent · P0</p>
        <h1>一起开启今天的英语探索</h1>
        <p>窗口材质与工具栏原型</p>
        <Link href="/">打开课程 →</Link>
      </section>
    </main>
  );
}
