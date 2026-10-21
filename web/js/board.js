/* Global leaderboard. */

import { el, toast, setModalBody, sectionTitle, button } from "./ui.js";
import { t, fmt } from "./i18n.js";
import { tgUser, haptic, shareScore } from "./telegram.js";
import { audio } from "./audio.js";

const medals = ["🥇", "🥈", "🥉"];

export function buildBoard(ctx) {
  const { store, demoMode } = ctx;
  let period = "all";
  let rows = null;
  let stats = null;
  let error = null;

  const wrap = el("div");
  const listNode = el("div");
  const tabs = el("div", { class: "tabs" });

  const renderTabs = () => {
    tabs.innerHTML = "";
    [
      { id: "all", label: t("allTime") },
      { id: "week", label: t("thisWeek") },
    ].forEach((item) => {
      tabs.append(
        el("button", {
          class: `tab ${period === item.id ? "active" : ""}`.trim(),
          text: item.label,
          onclick: async () => {
            period = item.id;
            renderTabs();
            await load();
          },
        })
      );
    });
  };

  const render = () => {
    listNode.innerHTML = "";
    if (stats) {
      listNode.append(
        el("div", { class: "preview-strip" }, [
          el("div", { class: "pv-emoji", text: "🌍" }),
          el("div", { class: "pv-text" }, [
            el("b", { text: t("season") }),
            el("span", {
              text: `${fmt(stats.players)} players · ${fmt(stats.damage)} damage · ${fmt(stats.kos)} K.O.`,
            }),
          ]),
        ])
      );
    }

    if (error) {
      listNode.append(el("div", { class: "hintline", text: demoMode ? t("demoNote") : "Could not load the leaderboard." }));
      listNode.append(
        button("↻ Retry", { variant: "ghost", onClick: () => load() })
      );
      return;
    }
    if (!rows) {
      listNode.append(el("div", { class: "card-sub", text: "…", style: { padding: "20px", textAlign: "center" } }));
      return;
    }
    if (!rows.length) {
      listNode.append(el("div", { class: "hintline", text: t("noScores") }));
    }
    const me = tgUser()?.id;
    rows.forEach((row) => {
      const mine = me && row.id === me;
      listNode.append(
        el("div", { class: `lb-row ${mine ? "me" : ""}`.trim() }, [
          el("div", { class: "lb-place", text: medals[row.place - 1] || String(row.place) }),
          el("div", { class: "lb-name" }, [
            el("div", { text: row.name || "Player" }),
            el("div", { class: "lb-sub", text: `best ${fmt(row.bestRound)} · ${row.bestCombo || 0}×` }),
          ]),
          el("div", { class: "lb-score", text: fmt(row.totalDamage) }),
        ])
      );
    });

    const statNode = el("div", { class: "field", style: { marginTop: "14px" } }, [
      el("label", {}, [
        el("span", { text: t("stats") }),
        el("b", { text: `${fmt(store.state.stats.totalDamage)}` }),
      ]),
      el("div", { class: "row", style: { justifyContent: "space-between" } }, [
        el("span", { class: "card-sub", text: `${t("bestCombo")}: ${store.state.stats.bestCombo}×` }),
        el("span", { class: "card-sub", text: `${t("roundsPlayed")}: ${store.state.stats.rounds}` }),
      ]),
    ]);
    listNode.append(statNode);
    listNode.append(
      button(`🔗 ${t("shareScore")}`, {
        variant: "ghost",
        onClick: () => {
          const text = t("shareText", { n: fmt(store.state.stats.totalDamage) });
          if (!shareScore(store.state.stats.totalDamage, text)) toast(t("shareUnsupported"), "bad");
        },
      })
    );
  };

  async function load() {
    rows = null;
    error = null;
    render();
    try {
      const [lbRes, statsRes] = await Promise.all([
        fetch(`/api/leaderboard?period=${period}&limit=20`, { headers: { Accept: "application/json" } }),
        fetch("/api/stats", { headers: { Accept: "application/json" } }),
      ]);
      const lb = await lbRes.json();
      const st = await statsRes.json();
      rows = lb.rows || [];
      stats = st.stats || null;
      audio.sfx("click");
      haptic("select");
    } catch {
      error = true;
      rows = [];
    }
    render();
  }

  renderTabs();
  wrap.append(tabs, listNode);
  render();
  load();
  return wrap;
}

export function refreshBoard(ctx) {
  setModalBody(buildBoard(ctx));
}
