# Portfolio Planning & Investment Analysis

Class project for **Investment Analysis** exploring how portfolio theory can be applied to a long-term investment planning problem.

The project builds an end-to-end investment analysis workflow in Python, from estimating return and risk characteristics to portfolio optimization, simulation, strategy comparison, and factor analysis.

## Project Overview

The analysis is organized around a hypothetical long-term investor with a defined savings plan and investment horizon.

The goal is to compare different portfolio choices and understand how they perform across:

- expected return
- volatility
- Sharpe ratio
- drawdown
- terminal wealth
- probability of reaching the investment goal

Rather than focusing on a single "optimal" portfolio, the project compares several approaches and studies how sensitive the results are to assumptions about returns, risk, and asset allocation.

---

## Portfolio Strategies

The project compares five portfolio strategies:

1. **100% SHV**  
   Cash / short-term Treasury baseline.

2. **100% IVV**  
   Full equity exposure.

3. **60/40 IVV / AGG**  
   Traditional stock-bond allocation.

4. **Tangency Portfolio — IVV / AGG / SHV**  
   Mean-variance optimized portfolio using a basic stock-bond-cash universe.

5. **Tangency Portfolio — IVV / AGG / SHV / QUAL / USMV**  
   Expanded portfolio including quality and minimum-volatility equity exposures.

The strategies are evaluated using both historical portfolio statistics and simulated long-term wealth outcomes.

---

## Portfolio Optimization

The optimization component uses standard mean-variance portfolio theory.

For a portfolio with weights \(w\), expected return is

\[
E[R_p] = w^\top \mu
\]

and portfolio variance is

\[
\sigma_p^2 = w^\top \Sigma w.
\]

The project constructs:

- expected return and covariance estimates
- efficient frontiers
- minimum-variance portfolios
- tangency portfolios
- capital allocation between risky assets and short-term Treasury exposure

The optimization is implemented in Python using numerical routines from SciPy.

---

## Simulation

To evaluate long-term investment outcomes, the project uses both:

- **Monte Carlo simulation**
- **Block bootstrap simulation**

The simulation incorporates the investor's annual savings schedule and generates distributions of terminal wealth across different portfolio strategies.

For each strategy, the analysis reports:

- mean terminal wealth
- median terminal wealth
- 5th / 25th / 75th / 95th percentiles
- probability of reaching the investment goal
- Sharpe ratio
- median-path maximum drawdown

This makes it possible to compare portfolios not only by expected return, but also by the distribution of possible outcomes.

---

## Factor Analysis

The project also uses regression-based asset pricing models to understand portfolio risk exposures.

### CAPM

For individual assets:

\[
R_i - R_f
=
\alpha
+
\beta (R_m - R_f)
+
\epsilon.
\]

The analysis reports:

- annualized alpha
- beta
- \(R^2\)
- t-statistics
- p-values

IVV is used as the market proxy and SHV as the risk-free proxy.

### Fama-French Five-Factor Model

The optimized portfolio is also evaluated using the Fama-French five-factor model:

\[
R_p - R_f
=
\alpha
+
\beta_M (Mkt-RF)
+
\beta_S SMB
+
\beta_H HML
+
\beta_R RMW
+
\beta_C CMA
+
\epsilon.
\]

The purpose is to understand whether portfolio returns are primarily explained by broad market exposure or by systematic factor tilts.

---

## Risk & Sensitivity Analysis

The project includes additional analysis of portfolio robustness, including:

- drawdown analysis
- stress testing
- sensitivity analysis
- changes in assumed returns
- changes in portfolio weights
- changes in investment conditions

These checks help show how strongly the investment conclusions depend on the underlying assumptions.

---

## Data

Historical ETF prices are downloaded using `yfinance`.

The main asset universe includes:

- **IVV** — U.S. large-cap equities
- **AGG** — U.S. aggregate bonds
- **SHV** — short-term U.S. Treasuries
- **QUAL** — quality-factor equities
- **USMV** — minimum-volatility equities

Fama-French factor data is downloaded from the Kenneth French Data Library.

---

## Tools

The project is implemented in **Python** using:

- NumPy
- Pandas
- SciPy
- statsmodels
- Matplotlib
- Seaborn
- yfinance
- pandas-datareader
- Jupyter

---

## Repository Structure

```text
.
├── analysis/
│   ├── compare_strategies.py
│   ├── factor_alpha.py
│   ├── risk_analysis.py
│   ├── sensitivity.py
│   └── analysis outputs
│
├── data/
│   ├── client_profile.py
│   └── pull_returns.py
│
├── models/
│   ├── portfolio_stats.py
│   ├── efficient_frontier.py
│   └── simulation.py
│
├── plots/
├── report/
├── config.py
├── requirements.txt
└── README.md
```

### Main Components

`data/client_profile.py`  
Builds the investor income, expense, savings, and contribution schedule.

`data/pull_returns.py`  
Downloads and prepares historical ETF return data.

`models/portfolio_stats.py`  
Calculates historical returns, covariance matrices, volatility, and portfolio statistics.

`models/efficient_frontier.py`  
Constructs efficient frontiers and tangency portfolios.

`models/simulation.py`  
Runs Monte Carlo and block-bootstrap simulations of long-term wealth.

`analysis/compare_strategies.py`  
Compares cash, equity, 60/40, and optimized portfolio strategies.

`analysis/factor_alpha.py`  
Runs CAPM and Fama-French five-factor regressions.

`analysis/risk_analysis.py`  
Evaluates portfolio risk and downside behavior.

`analysis/sensitivity.py`  
Tests how portfolio conclusions change under alternative assumptions.

---

## Running the Project

Create a virtual environment and install the dependencies:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On Windows:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Then run the individual analysis modules as needed.

For example:

```bash
python -m data.pull_returns
python -m data.client_profile
python -m analysis.compare_strategies
python -m analysis.factor_alpha
python -m analysis.risk_analysis
python -m analysis.sensitivity
```

---

## What I Used This Project For

This was primarily a course project and a practical exercise in translating investment concepts into code.

The main skills I practiced were:

- portfolio return and risk estimation
- mean-variance optimization
- efficient frontier construction
- Monte Carlo and bootstrap simulation
- portfolio strategy comparison
- CAPM and factor regressions
- stress testing and sensitivity analysis
- building a reproducible Python investment-analysis workflow
