/**
 * Jest mock for compromise.
 * Uses CJS exports so babel-jest can load it without ESM issues.
 * Provides the minimal chain: nlp(text).nouns().toSingular().out('array')
 *                              nlp(text).verbs().toInfinitive().out('array')
 */

const nlp = function (text) {
  const words = (text || '').toLowerCase().split(/\s+/).filter(Boolean)

  const nounChain = {
    toSingular: function () {
      return {
        out: function () {
          return words.map(function (w) {
            return w.endsWith('s') && w.length > 3 ? w.slice(0, -1) : w
          })
        },
      }
    },
  }

  const verbChain = {
    toInfinitive: function () {
      return {
        out: function () {
          return words.map(function (w) {
            if (w.endsWith('ing') && w.length > 5) {
              const stem = w.slice(0, -3)
              // De-double consonant: "runn" -> "run", "swimm" -> "swim"
              const last = stem[stem.length - 1]
              const prev = stem[stem.length - 2]
              if (last && prev && last === prev && /[bcdfghjklmnpqrstvwxyz]/.test(last)) {
                return stem.slice(0, -1)
              }
              return stem
            }
            if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2)
            return w
          })
        },
      }
    },
  }

  return {
    nouns: function () { return nounChain },
    verbs: function () { return verbChain },
  }
}

module.exports = nlp
module.exports.default = nlp
