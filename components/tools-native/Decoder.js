"use client";

import React, { useMemo } from "react";
import { useToolState } from "@/stores/toolState";
import decoderData from "./decoderData";

const categoryOptions = ["All", "Weather", "General"];

const Decoder = () => {
  const { decoder, setDecoder } = useToolState();
  const input = decoder.input ?? "";
  const activeCategory = decoder.activeCategory ?? "All";

  const words = useMemo(
    () => input.toUpperCase().trim().split(/\s+/).filter(Boolean),
    [input]
  );

  const allowedUsages = useMemo(() => {
    if (activeCategory === "Weather") {
      return ["METAR", "TAF", "METAR/TAF", "NWS"];
    }
    if (activeCategory === "General") {
      return ["GEN", "ATC", "ICAO"];
    }
    return ["METAR", "TAF", "METAR/TAF", "GEN", "NWS", "ATC", "ICAO"];
  }, [activeCategory]);

  const filteredData = useMemo(
    () =>
      decoderData.filter(
        (item) =>
          allowedUsages.includes(item.usage) &&
          words.includes(item.contraction.toUpperCase())
      ),
    [allowedUsages, words]
  );

  const naturalLanguageResult = useMemo(() => {
    const contractionMap = {};

    filteredData.forEach((item) => {
      contractionMap[item.contraction.toUpperCase()] = `${item.contraction} (${item.definition})`;
    });

    return words.map((word) => contractionMap[word] ?? word).join(" ");
  }, [filteredData, words]);

  return (
    <div className="decoder-shell">
      <section className="decoder-pane">
        <div className="decoder-section-head">
          <h2>Enter METAR, TAF, or shorthand</h2>
          <p>Paste a line of weather text or type abbreviations to decode them below.</p>
        </div>

        <textarea
          className="decoder-input"
          placeholder="Example: KPDX 121953Z 28012KT 10SM BKN045"
          value={input}
          onChange={(event) =>
            setDecoder((current) => ({ ...current, input: event.target.value }))
          }
        />

        <div className="decoder-chip-group">
          {categoryOptions.map((category) => (
            <button
              key={category}
              type="button"
              className={`decoder-chip ${activeCategory === category ? "decoder-chip-active" : ""}`}
              onClick={() =>
                setDecoder((current) => ({ ...current, activeCategory: category }))
              }
            >
              {category}
            </button>
          ))}
        </div>
      </section>

      <section className="decoder-pane decoder-results">
        <div className="decoder-section-head">
          <h2>Decoded output</h2>
          <p>
            {words.length > 0
              ? `${filteredData.length} matching term${filteredData.length === 1 ? "" : "s"} found`
              : "Enter text to see decoded terms"}
          </p>
        </div>

        {words.length > 0 ? (
          filteredData.length > 0 ? (
            <>
              <div className="decoder-result-copy">{naturalLanguageResult}</div>
              <div className="decoder-definition-list">
                {filteredData.map((item) => (
                  <article key={`${item.contraction}-${item.usage}`} className="decoder-definition-card">
                    <div>
                      <p className="muted-kicker">{item.usage}</p>
                      <h3>{item.contraction}</h3>
                    </div>
                    <p>{item.definition}</p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="decoder-empty">
              No matching terms found in the selected category.
            </div>
          )
        ) : (
          <div className="decoder-empty">
            Start with a METAR, TAF, or abbreviation list in the input panel.
          </div>
        )}
      </section>
    </div>
  );
};

export default Decoder;
