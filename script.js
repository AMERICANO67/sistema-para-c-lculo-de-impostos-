const $ = (id) => document.getElementById(id);

const marginOptions = [
  0.05, 0.1, 0.15, 0.2, 0.25, 0.3,
  0.35, 0.4, 0.45, 0.5, 0.55, 0.6,
  0.7, 0.8, 0.9, 1.0, 1.1, 1.2,
];

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format((Number.isFinite(value) ? value : 0) * 100) + "%";
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(Number.isFinite(value) ? value : 0);
}

function populateMargins() {
  const select = $("marginSelect");

  marginOptions.forEach((margin) => {
    const option = document.createElement("option");
    option.value = String(margin);
    option.textContent = formatPercent(margin);
    if (margin === 0.6) {
      option.selected = true;
    }
    select.appendChild(option);
  });
}

function getModeConfig(mode) {
  if (mode === "net") {
    return {
      label: "margem líquida sobre venda",
      formulaWith: "Venda = Compra x (1 - Restituição) ÷ (1 - ICMS - Margem)",
      formulaWithout: "Venda = Compra ÷ (1 - ICMS - Margem)",
      helperText:
        "Regra ativa: margem líquida sobre venda. Nesta leitura, 60% significa que o lucro precisa representar 60% do preço final, por isso o valor de venda cresce bastante.",
      tableSubtitle: "Coeficientes para margem líquida sobre venda",
      scenarioCaption: "para atingir a margem líquida escolhida",
      kpiLabel: "Margem líquida",
    };
  }

  return {
    label: "margem sobre custo",
    formulaWith: "Venda = Compra x (1 - Restituição) x (1 + Margem) ÷ (1 - ICMS)",
    formulaWithout: "Venda = Compra x (1 + Margem) ÷ (1 - ICMS)",
    helperText:
      "Regra ativa: margem sobre custo. Exemplo: compra de R$ 100,00 com 60% gera R$ 160,00 após cobrir o ICMS na saída no cenário com restituição de 18%.",
    tableSubtitle: "Coeficientes para margem sobre custo",
    scenarioCaption: "para atingir o acréscimo desejado sobre o custo",
    kpiLabel: "Margem sobre custo",
  };
}

function updateModeUI(mode) {
  const config = getModeConfig(mode);

  $("marginFieldLabel").textContent =
    mode === "net" ? "Margem líquida desejada" : "Margem sobre custo desejada";
  $("kpiMarginLabel").textContent = config.kpiLabel;
  $("modeHelperText").textContent = config.helperText;
  $("formulaWith").textContent = config.formulaWith;
  $("formulaWithout").textContent = config.formulaWithout;
  $("tableSubtitle").textContent = config.tableSubtitle;
  $("scenarioWithCaption").textContent = config.scenarioCaption;
  $("scenarioWithoutCaption").textContent = config.scenarioCaption;
}

function updateTicks(maxScale) {
  const step = maxScale / 5;
  $("tick0").textContent = "0";
  $("tick1").textContent = Math.round(step);
  $("tick2").textContent = Math.round(step * 2);
  $("tick3").textContent = Math.round(step * 3);
  $("tick4").textContent = Math.round(step * 4);
  $("tick5").textContent = Math.round(step * 5);
}

function renderChart(saleWith, saleWithout) {
  const maxScale = Math.max(250, Math.ceil(Math.max(saleWith, saleWithout) / 50) * 50);
  const heightWith = Math.max(2, (saleWith / maxScale) * 100);
  const heightWithout = Math.max(2, (saleWithout / maxScale) * 100);

  $("chartValWith").textContent = formatCurrency(saleWith);
  $("chartValWithout").textContent = formatCurrency(saleWithout);
  $("chartBarWith").style.height = `${heightWith}%`;
  $("chartBarWithout").style.height = `${heightWithout}%`;

  updateTicks(maxScale);
}

function getScenarioValues(mode, purchase, margin, restitutionTax, exitTax) {
  const restitutionValue = purchase * restitutionTax;
  const effectiveCostWith = purchase - restitutionValue;
  const effectiveCostWithout = purchase;

  if (mode === "net") {
    const denominator = 1 - exitTax - margin;

    if (denominator <= 0) {
      return { error: "A soma de ICMS na saída com a margem precisa ser menor que 100%." };
    }

    const saleWith = effectiveCostWith / denominator;
    const saleWithout = effectiveCostWithout / denominator;
    const outputTaxWith = saleWith * exitTax;
    const outputTaxWithout = saleWithout * exitTax;

    return {
      restitutionValue,
      effectiveCostWith,
      effectiveCostWithout,
      saleWith,
      saleWithout,
      outputTaxWith,
      outputTaxWithout,
      taxDueWith: Math.max(0, outputTaxWith - restitutionValue),
      taxDueWithout: outputTaxWithout,
      profitWith: saleWith * margin,
      profitWithout: saleWithout * margin,
    };
  }

  if (exitTax >= 1) {
    return { error: "O ICMS na saída precisa ser menor que 100%." };
  }

  const taxBaseFactor = 1 - exitTax;
  const saleWith = effectiveCostWith * (1 + margin) / taxBaseFactor;
  const saleWithout = effectiveCostWithout * (1 + margin) / taxBaseFactor;
  const outputTaxWith = saleWith * exitTax;
  const outputTaxWithout = saleWithout * exitTax;

  return {
    restitutionValue,
    effectiveCostWith,
    effectiveCostWithout,
    saleWith,
    saleWithout,
    outputTaxWith,
    outputTaxWithout,
    taxDueWith: Math.max(0, outputTaxWith - restitutionValue),
    taxDueWithout: outputTaxWithout,
    profitWith: effectiveCostWith * margin,
    profitWithout: effectiveCostWithout * margin,
  };
}

function getReferenceCoefficients(mode, margin, restitutionTax, exitTax) {
  if (mode === "net") {
    const denominator = 1 - exitTax - margin;
    if (denominator <= 0) {
      return null;
    }

    return {
      withRestitution: (1 - restitutionTax) / denominator,
      withoutRestitution: 1 / denominator,
    };
  }

  if (exitTax >= 1) {
    return null;
  }

  const factor = (1 + margin) / (1 - exitTax);
  return {
    withRestitution: (1 - restitutionTax) * factor,
    withoutRestitution: factor,
  };
}

function renderReferenceTable(mode, currentMargin, restitutionTax, exitTax) {
  const tbody = $("referenceTable");
  tbody.innerHTML = "";

  marginOptions.forEach((margin) => {
    const coefficients = getReferenceCoefficients(mode, margin, restitutionTax, exitTax);
    if (!coefficients) {
      return;
    }
    const row = document.createElement("tr");

    if (Math.abs(margin - currentMargin) < 0.0001) {
      row.className = "active-row";
    }

    row.innerHTML = `
      <td>${Math.round(margin * 100)}%</td>
      <td>${formatNumber(coefficients.withRestitution)}</td>
      <td>${formatCurrency(100 * coefficients.withRestitution)}</td>
      <td>${formatNumber(coefficients.withoutRestitution)}</td>
      <td>${formatCurrency(100 * coefficients.withoutRestitution)}</td>
    `;

    tbody.appendChild(row);
  });
}

function calculate() {
  const mode = $("calcModeSelect").value;
  const purchase = Math.max(0, Number($("purchaseInput").value) || 0);
  const margin = Number($("marginSelect").value || 0);
  const restitutionTax = Math.max(0, Number($("restitutionTaxInput").value) || 0) / 100;
  const exitTax = Math.max(0, Number($("exitTaxInput").value) || 0) / 100;
  const results = getScenarioValues(mode, purchase, margin, restitutionTax, exitTax);

  updateModeUI(mode);

  if (results.error) {
    window.alert(results.error);
    return;
  }

  const {
    restitutionValue,
    effectiveCostWith,
    effectiveCostWithout,
    saleWith,
    saleWithout,
    outputTaxWith,
    outputTaxWithout,
    taxDueWith,
    taxDueWithout,
    profitWith,
    profitWithout,
  } = results;
  const difference = saleWithout - saleWith;

  $("pillScenario1").textContent =
    `${(restitutionTax * 100).toFixed(2).replace(".", ",")}% restituído + ${(exitTax * 100).toFixed(2).replace(".", ",")}% de ICMS na saída`;
  $("pillScenario2").textContent =
    `Sem restituição + ${(exitTax * 100).toFixed(2).replace(".", ",")}% de ICMS na saída`;

  $("kpiWithRestitution").textContent = formatCurrency(saleWith);
  $("kpiWithoutRestitution").textContent = formatCurrency(saleWithout);
  $("kpiDifference").textContent = formatCurrency(difference);
  $("kpiMargin").textContent = formatPercent(margin);

  $("saleWithRestitution").textContent = formatCurrency(saleWith);
  $("buyWithRestitution").textContent = formatCurrency(purchase);
  $("restitutionValue").textContent = formatCurrency(restitutionValue);
  $("effectiveCost").textContent = formatCurrency(effectiveCostWith);
  $("outputTaxWith").textContent = formatCurrency(outputTaxWith);
  $("taxDueWith").textContent = formatCurrency(taxDueWith);
  $("profitWith").textContent = formatCurrency(profitWith);

  $("saleWithoutRestitution").textContent = formatCurrency(saleWithout);
  $("buyWithoutRestitution").textContent = formatCurrency(purchase);
  $("noRestitutionValue").textContent = formatCurrency(0);
  $("effectiveCostNoRestitution").textContent = formatCurrency(effectiveCostWithout);
  $("outputTaxWithout").textContent = formatCurrency(outputTaxWithout);
  $("taxDueWithout").textContent = formatCurrency(taxDueWithout);
  $("profitWithout").textContent = formatCurrency(profitWithout);

  $("insightDifference").textContent = formatCurrency(difference);
  if (mode === "net") {
    $("insightWith").textContent =
      `Com custo efetivo de ${formatCurrency(effectiveCostWith)}, a venda necessária sobe para ${formatCurrency(saleWith)} para manter lucro líquido de ${formatPercent(margin)} sobre a venda.`;
    $("insightWithout").textContent =
      `Sem recuperação, a mesma margem líquida exige ${formatCurrency(saleWithout)} de venda.`;
  } else {
    $("insightWith").textContent =
      `Com restituição, o custo efetivo cai para ${formatCurrency(effectiveCostWith)} e a venda necessária fica em ${formatCurrency(saleWith)}.`;
    $("insightWithout").textContent =
      `Sem restituição, a venda sobe para ${formatCurrency(saleWithout)} para manter ${formatPercent(margin)} sobre o custo.`;
  }

  renderChart(saleWith, saleWithout);
  renderReferenceTable(mode, margin, restitutionTax, exitTax);
}

function resetExample() {
  $("calcModeSelect").value = "markup";
  $("purchaseInput").value = "100";
  $("marginSelect").value = "0.6";
  $("restitutionTaxInput").value = "18";
  $("exitTaxInput").value = "18";
  calculate();
}

function bindEvents() {
  $("calcModeSelect").addEventListener("change", calculate);
  $("purchaseInput").addEventListener("input", calculate);
  $("marginSelect").addEventListener("change", calculate);
  $("restitutionTaxInput").addEventListener("input", calculate);
  $("exitTaxInput").addEventListener("input", calculate);
  $("resetBtn").addEventListener("click", resetExample);

  $("toggleTableBtn").addEventListener("click", () => {
    const tableContainer = $("tableContainer");
    const toggleText = $("toggleText");
    const hidden = tableContainer.style.display === "none";

    tableContainer.style.display = hidden ? "block" : "none";
    toggleText.textContent = hidden ? "Ocultar" : "Mostrar";
  });
}

populateMargins();
bindEvents();
calculate();
