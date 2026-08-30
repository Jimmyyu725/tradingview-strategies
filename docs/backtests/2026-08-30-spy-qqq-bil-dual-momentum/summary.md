# SPY、QQQ 与 BIL 双动量回测报告

结论：PASS

| 策略 | 成本口径 | 累计收益 | CAGR | 最大回撤 | 交易数 | 费用 | 假设清仓权益 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dual_momentum | zero_cost | 92.87% | 15.18% | -18.08% | 17 | 0.00 | 192872.23 |
| dual_momentum | webull_current | 92.74% | 15.16% | -18.09% | 17 | 20.05 | 192731.10 |
| dual_momentum | robinhood_current | 92.74% | 15.16% | -18.09% | 17 | 20.05 | 192731.09 |
| sma_200 | zero_cost | 51.45% | 9.34% | -16.55% | 61 | 0.00 | 151445.05 |
| sma_200 | webull_current | 50.70% | 9.22% | -16.86% | 61 | 60.44 | 150698.86 |
| sma_200 | robinhood_current | 50.70% | 9.22% | -16.86% | 61 | 60.43 | 150698.86 |
| sma_10m | zero_cost | 25.44% | 5.00% | -23.53% | 25 | 0.00 | 125438.33 |
| sma_10m | webull_current | 25.20% | 4.95% | -23.60% | 25 | 23.55 | 125193.28 |
| sma_10m | robinhood_current | 25.20% | 4.95% | -23.60% | 25 | 23.55 | 125193.28 |
| spy_buy_hold | zero_cost | 68.09% | 11.82% | -23.28% | 1 | 0.00 | 168085.24 |
| spy_buy_hold | webull_current | 68.08% | 11.82% | -23.27% | 1 | 0.00 | 168076.08 |
| spy_buy_hold | robinhood_current | 68.08% | 11.82% | -23.27% | 1 | 0.00 | 168076.09 |

回测区间：2022-01-03 至 2026-08-28

数据门禁：通过

开发期合理性检查（不用于选择规则）：2009-02-02 至 2021-12-31
开发期双动量累计收益：599.81%
开发期 SPY 累计收益：618.55%

资格明细：{"webull_current":{"returnPassed":true,"drawdownPassed":true,"excessReturn":0.2465598137929521,"drawdownDifference":-0.051863493866798116,"passed":true},"robinhood_current":{"returnPassed":true,"drawdownPassed":true,"excessReturn":0.24655971513610186,"drawdownDifference":-0.05186347453213813,"passed":true}}

双动量 Webull 持仓阶段：{"SPY":{"days":205,"compoundedReturn":-0.19044375589797868},"BIL":{"days":229,"compoundedReturn":0.031227657635459538},"QQQ":{"days":734,"compoundedReturn":1.3086858316372543}}

限制：Webull 与 Robinhood 当前费率统一应用于整个历史区间，不是逐日历史费率复原；结果未计税费。

本报告没有连接券商或提交任何订单。
