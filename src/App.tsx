import './App.css'

function App() {
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Fishlle Stock</p>
        <h1>フィシュルストック</h1>
        <p>フィシュルの冷凍在庫をスマホでさっと確認するためのアプリです。</p>
      </section>

      <section className="card">
        <h2>これから作る機能</h2>
        <ul>
          <li>届いた商品の一覧表示</li>
          <li>フィシュルの注文テキストから一括追加</li>
          <li>「食べた」ボタンで残数を1つ減らす</li>
          <li>端末内へのローカル保存</li>
        </ul>
      </section>
    </main>
  )
}

export default App
