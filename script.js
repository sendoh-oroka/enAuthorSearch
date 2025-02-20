// 検索クエリ
const queries = {
  initial: `
    query enWorksQuery($author: String!) {
      user(name: $author) {
        attributedPages(
          sort: { key: CREATED_AT, order: DESC }, 
          filter: { wikidotInfo: { category: { eq: "_default" } } }, 
          first: 50
        ) {
          edges {
            node {
              url
              wikidotInfo {
                title
                rating
                createdAt
              }
              translations {
                url
                wikidotInfo {
                  title
                  rating
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  `,
  further: `
    query enWorksQuery($author: String!, $lastCreatedAt: DateTime) {
      user(name: $author) {
        attributedPages(
          sort: { key: CREATED_AT, order: DESC }, 
          filter: { wikidotInfo: { 
            category: { eq: "_default" },
            createdAt: { lt: $lastCreatedAt }
          } }, 
          first: 50
        ) {
          edges {
            node {
              url
              wikidotInfo {
                title
                rating
                createdAt
              }
              translations {
                url
                wikidotInfo {
                  title
                  rating
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  `
};

let currentAuthor = "";
let currentBoundary = null;

// GraphQL API呼び出し用の関数
async function executeQuery(author, lastCreatedAt) {
  const query = lastCreatedAt ? queries.further : queries.initial;
  const variablesObj = lastCreatedAt ? { author, lastCreatedAt } : { author };
  const variables = JSON.stringify(variablesObj);
  const requestURL = `https://api.crom.avn.sh/graphql?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(variables)}`;

  const response = await fetch(requestURL, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  const { data, errors } = await response.json();
  if (errors && errors.length > 0) {
    throw new Error("GraphQL errors: " + JSON.stringify(errors));
  }

  return data;
}

// 日付フォーマット用の関数
function formatDate(dateString) {
  const date = new Date(dateString);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

// 指定パターンにマッチする情報を抽出する共通関数
function extractInfo(node, pattern, checkMainURL = false) {
  if (checkMainURL && pattern.test(node.url)) {
    return {
      url: node.url,
      title: node.wikidotInfo.title,
      rating: node.wikidotInfo.rating,
      createdAt: formatDate(node.wikidotInfo.createdAt),
      rawCreatedAt: node.wikidotInfo.createdAt
    };
  }

  if (node.translations && Array.isArray(node.translations)) {
    const match = node.translations.find((t) => pattern.test(t.url));
    if (match) {
      const info = {
        url: match.url,
        title: match.wikidotInfo.title,
        rating: match.wikidotInfo.rating,
        createdAt: formatDate(match.wikidotInfo.createdAt)
      };
      // ENの場合、rawCreatedAtが必要
      if (checkMainURL) {
        info.rawCreatedAt = match.wikidotInfo.createdAt;
      }
      return info;
    }
  }
  return null;
}

// JSONからEN情報を取り出す関数
function getENinfo(node) {
  return extractInfo(node, /^http:\/\/scp-wiki\..*/, true);
}

// JSONからJP情報を取り出す関数
function getJPinfo(node) {
  return extractInfo(node, /^http:\/\/scp-jp\..*/, false);
}

// レスポンスからページ情報を整形し、結果エリアへ表示する関数
function renderPages(pages, append = false) {
  const resultContainer = document.getElementById("result");
  
  // 検索結果が0件の場合（初回検索時のみ）
  if (!pages.length && !append) {
    resultContainer.innerHTML = "<p>Wikidot IDが間違っています</p>";
    return;
  }
  
  const pagesHTML = pages
    .map(({ node }) => {
      const enInfo = getENinfo(node);
      const jpInfo = getJPinfo(node);
      if (!enInfo || !jpInfo) return "";
      return `
        <div class="page">
          <p><a href="${jpInfo.url}" target="_blank">${jpInfo.title}</a></p>
          <p class="details">
            <strong>原語版:</strong> 
            <a href="${enInfo.url}" target="_blank">${enInfo.title}</a> 
            (${enInfo.createdAt}投稿 / ${jpInfo.createdAt}翻訳)
          </p>
          <p class="details">
            <strong>EN:</strong> ${enInfo.rating} / <strong>JP:</strong> ${jpInfo.rating}
          </p>
        </div>
      `;
    })
    .join("");

  if (append) {
    resultContainer.innerHTML += pagesHTML;
  } else {
    resultContainer.innerHTML = pagesHTML;
  }
}

// Loadボタンの作成・削除を管理する関数
function updateLoadButton(show) {
  let btn = document.getElementById("loadButton");

  if (show) {
    if (!btn) {
      // 初期状態に存在するボタンを再利用または新規生成
      btn = document.getElementById("button") || document.createElement("button");
      btn.id = "loadButton";
      btn.textContent = "更に検索する";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await searchAndRender(currentAuthor, currentBoundary, true);
      });
      // すでに存在していない場合のみ追加
      if (!document.getElementById("button")) {
        document.querySelector(".container").appendChild(btn);
      }
    }
    btn.disabled = false;
  } else if (btn) {
    btn.remove();
  }
}

// ローディングアニメーションを管理する関数
function showLoading() {
  const loadingElement = document.getElementById("loading");
  if (loadingElement) {
    loadingElement.style.display = "block";
  }
}
function hideLoading() {
  const loadingElement = document.getElementById("loading");
  if (loadingElement) {
    loadingElement.style.display = "none";
  }
}

// 検索結果の取得とレンダリングを行う関数
async function searchAndRender(author, boundary = null, append = false) {
  showLoading();
  try {
    const response = await executeQuery(author, boundary);
    const pages = response.user.attributedPages.edges;
    renderPages(pages, append);

    // レスポンス件数が上限の場合は更に検索可能とする
    if (pages.length === 50) {
      const lastNode = pages[pages.length - 1].node;
      currentBoundary = lastNode.wikidotInfo.createdAt ? lastNode.wikidotInfo.createdAt : null;
      updateLoadButton(true);
    } else {
      currentBoundary = null;
      updateLoadButton(false);
    }
  } catch (error) {
    console.error("検索に失敗しました", error);
    document.getElementById("result").innerHTML =
      "<p>エラーが発生しました。再度お試しください。</p>";
  } finally {
    hideLoading();
  }
}

// DOM読み込み後にイベントリスナを設定
document.addEventListener("DOMContentLoaded", () => {
  const authorInput = document.getElementById("authorInput");
  const searchButton = document.getElementById("searchButton");
  const resultContainer = document.getElementById("result");

  // 初回検索時のイベントハンドラ設定
  searchButton.addEventListener("click", () => {
    const author = authorInput.value.trim();
    if (!author) {
      alert("Wikidot IDを入力してください");
      return;
    }

    // 検索状態を初期化
    currentAuthor = author;
    currentBoundary = null;
    resultContainer.innerHTML = "";
    updateLoadButton(false);
    searchAndRender(currentAuthor);
  });

  // Enterキーでも検索をトリガー
  authorInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      searchButton.click();
    }
  });
});
