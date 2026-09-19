# Bannerfall Phase 1.6 — Volley & Bayonet

Phase 1.5の戦列歩兵プロトタイプに、接近時の自動白兵戦モードを追加したバージョンです。

## 操作

- WASD: 戦列移動（戦列戦中）
- Mouse: 戦列の向き
- Left Click: 一斉射撃
- Esc / P: 一時停止
- R: 再戦

## Phase 1.6の追加要素

- 両軍の距離が一定以下になると自動でMELEEへ移行
- MELEE移行後は戦列を解除し、各兵士が最寄りの敵を個別追跡
- 銃剣による近接攻撃、攻撃クールダウン、ノックバック
- 味方同士の簡易分離処理で乱戦を形成
- 白兵戦中は一斉射撃不可
- 銃剣突き・白兵戦ヒットの視覚演出

## GitHub Pages

`vite.config.ts` の `base` は `/bannerfall-testplay/` のままです。
既存の `.github/workflows/deploy.yml` はPhase 1.6で変更不要です。現在のWorkflowをそのまま使用してください。
