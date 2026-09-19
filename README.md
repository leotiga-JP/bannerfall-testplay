# Bannerfall Phase 2 — Battlefield Simulation

Phase 1.8 の戦列射撃・突撃・白兵戦・離脱・再整列を、20部隊 vs 20部隊の大規模戦場へ拡張したプロトタイプです。

## Phase 2 の検証目的

- 40部隊がそれぞれ独立して判断したとき、自然な戦線が形成されるか
- 各部隊が射撃・前進・後退・側面移動・突撃・再編・白兵戦離脱を使い分けられるか
- 1部隊だけをプレイヤーが操作したとき、局地的な介入が戦局全体へ波及するか
- 約800兵をブラウザ上で動かした際の視認性と負荷を確認する

## 戦場

- BLUE: 20部隊
- RED: 20部隊
- 1部隊: 20兵
- 最大約800兵
- ワールド: 5600 × 3600
- プレイヤー: BLUE B10

## 操作

- WASD: プレイヤー部隊移動
- Mouse: 戦列の向き
- Left Click: 一斉射撃
- Hold Right Click / Space → Release: 突撃方向指定 → 突撃
- Right Click during charge/melee: 離脱
- F: 再整列
- Mouse Wheel: ズーム
- Middle Mouse Drag: 自由カメラ
- C: プレイヤー部隊へカメラ復帰
- F3: AIデバッグ表示
- 1 / 2 / 3: 0.5x / 1x / 2x
- Esc / P: Pause
- R: Restart

## AI

各AI部隊は独立した性格値（攻撃性・慎重さ・側面志向・好みの射撃距離）を持ちます。判断は毎フレームではなく約0.28〜0.78秒間隔で行い、ターゲットへの味方集中度も考慮します。

主な行動:

- ADVANCE
- HOLD / VOLLEY
- FLANK
- RETREAT
- CHARGE
- MELEE
- REFORM

F3で各部隊の現在行動とターゲットを確認できます。

## GitHub Pages

既存の `deploy.yml` は変更不要です。現在 GitHub Actions から GitHub Pages への公開が成功している場合、今回のプロジェクトファイルを既存リポジトリへ上書きして push してください。

`vite.config.ts` は現在の公開先 `/bannerfall-testplay/` 用に設定済みです。
