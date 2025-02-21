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
let allPages = [];

const buildCromApiUrl = (query, variables) => `https://api.crom.avn.sh/graphql?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(JSON.stringify(variables))}`
const getENinfo = (node) => extractInfo(node, /^http:\/\/scp-wiki\..*/, true);
const getJPinfo = (node) => extractInfo(node, /^http:\/\/scp-jp\..*/);

// GraphQL API呼び出し用の関数
async function executeQuery(author, lastCreatedAt) {
  const isFurther = Boolean(lastCreatedAt)
  const query = isFurther ? queries.further : queries.initial;
  const variables = isFurther ? { author, lastCreatedAt } : { author };
  const requestUrl = buildCromApiUrl(query, variables);

  const response = await fetch(requestUrl, {
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
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

// 共通の情報抽出関数
function extractInfo(node, pattern, checkMainUrl = false) {
  const selectInfo = (obj) => ({
    url: obj.url,
    title: obj.wikidotInfo.title,
    rating: obj.wikidotInfo.rating,
    createdAt: new Date(obj.wikidotInfo.createdAt)
  });

  if (checkMainUrl && pattern.test(node.url)) {
    return selectInfo(node);
  }

  if (Array.isArray(node.translations)) {
    const match = node.translations.find((t) => pattern.test(t.url));
    if (match) return selectInfo(match);
  }
  return null;
}

// HTMLを生成する関数
function buildPageHhml(node) {
  const enInfo = getENinfo(node);
  const jpInfo = getJPinfo(node);

  if(!enInfo) return "";

  if(!jpInfo) {
    return `
      <div class="untransPage">
        <p><strong>未訳:</strong> <a href="${enInfo.url}" target="_blank">${enInfo.title}</a><span class="postDate"> ${formatDate(enInfo.createdAt)}投稿</span></p>
      </div>
    `;
  }

  return `
    <div class="page">
      <p><a href="${jpInfo.url}" target="_blank">${jpInfo.title}</a></p>
      <p class="details">
        <strong>原語版:</strong> 
        <a href="${enInfo.url}" target="_blank">${enInfo.title}</a><span class="postDate"> ${formatDate(jpInfo.createdAt)}翻訳 ${formatDate(enInfo.createdAt)}投稿</span>
      </p>
      <p class="details">
        <strong>EN:</strong> ${enInfo.rating} / <strong>JP:</strong> ${jpInfo.rating}
      </p>
    </div>
  `;
}

// レスポンスからページ情報をレンタリングする関数
function renderPages(pages) {
  const resultContainer = document.getElementById("result");
  
  // 初回検索時に検索結果が0件の場合
  if (!pages.length) {
    resultContainer.innerHTML = "<p>Wikidot IDが間違っています。</p>";
    return;
  }

  // 日付ソート
  const sortedPages = pages.slice().sort((a, b) => {
    const enInfoA = getENinfo(a.node);
    const enInfoB = getENinfo(b.node);
    if(!enInfoA && !enInfoB) return 0;
    if(!enInfoA) return 1;
    if(!enInfoB) return -1;
    return enInfoB.createdAt - enInfoA.createdAt;
  });
  
  const pagesHTML = sortedPages.map(({ node }) => buildPageHhml(node)).join("");
  resultContainer.innerHTML = pagesHTML;
}

// 再検索ボタンの作成・削除を管理する関数
function updateLoadButton(show) {
  let btn = document.getElementById("loadButton");

  if (show) {
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "loadButton";
      btn.textContent = "更に検索する";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await searchAndRender(currentAuthor, currentBoundary, true);
      });
      document.querySelector(".container").appendChild(btn);
    }
    btn.disabled = false;
  } else if (btn) {
    btn.remove();
  }
}

// ローディングアニメーションを管理する関数
function showLoading(show) {
  const loadingElement = document.getElementById("loading");
  loadingElement.style.display = show ? "block" : "none";
}

// 検索結果の取得とレンダリングを行う関数
async function searchAndRender(author, boundary = null, append = false) {
  showLoading(true);
  try {
    const response = await executeQuery(author, boundary);
    const pages = response.user.attributedPages.edges;

    allPages = append ? [...allPages, ...pages] : pages;

    renderPages(allPages);

    // レスポンス件数が上限の場合は更に検索可能とする
    if (pages.length === 50) {
      const lastNode = pages[pages.length - 1].node;
      currentBoundary = lastNode.wikidotInfo.createdAt || null;
      updateLoadButton(true);
    } else {
      currentBoundary = null;
      updateLoadButton(false);
    }
  } catch (error) {
    console.error("検索に失敗しました", error);
    document.getElementById("result").innerHTML = "<p>エラーが発生しました。再度お試しください。</p>";
  } finally {
    showLoading(false);
  }
}

// DOM読み込み後の初期設定
document.addEventListener("DOMContentLoaded", () => {
  const authorInput = document.getElementById("authorInput");
  const searchButton = document.getElementById("searchButton");
  const resultContainer = document.getElementById("result");

  // 初回検索時のイベント設定
  searchButton.addEventListener("click", () => {
    const author = authorInput.value.trim();
    if (!author) {
      alert("Wikidot IDを入力してください");
      return;
    }

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
