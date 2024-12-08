// src/client/script.js

let selectedNode = null; // Хранит данные о текущем выбранном узле или null если нет выбранного

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('user-form');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');

    // Обработка отправки формы, только если форма существует на странице
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault(); // Предотвращаем стандартную отправку формы

            const userIdInput = document.getElementById('user_id');
            const user_id = userIdInput.value.trim();

            if (!user_id) {
                alert('Пожалуйста, введите ID пользователя.');
                return;
            }

            // Показываем loader и скрываем предыдущие сообщения
            if (loader) loader.classList.remove('hidden');
            if (errorMessage) errorMessage.classList.add('hidden');

            // Отправляем POST запрос на /build_graph
            fetch('/build_graph', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `user_id=${encodeURIComponent(user_id)}`
            })
            .then(response => {
                if (response.ok) {
                    // Перенаправляем на страницу графа
                    window.location.href = '/graph';
                } else {
                    return response.json().then(data => { throw new Error(data.error || 'Неизвестная ошибка'); });
                }
            })
            .catch(error => {
                console.error('Ошибка:', error);
                if (errorMessage) {
                    errorMessage.textContent = `Произошла ошибка: ${error.message}`;
                    errorMessage.classList.remove('hidden');
                }
                if (loader) loader.classList.add('hidden');
            });
        });
    }

    // Загружаем граф, если на странице graph.html
    if (document.getElementById('graph')) {
        fetch('/data/graph_data.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Не удалось загрузить данные графа');
                }
                return response.json();
            })
            .then(data => {
                // Фильтруем удалённых пользователей
                data.nodes = data.nodes.filter(d => d.deactivated !== 'deleted');

                // Обновляем список id оставшихся узлов
                const nodeIds = new Set(data.nodes.map(d => d.id));
                // Фильтруем связи, чтобы не было ссылок на удалённых пользователей
                data.links = data.links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

                renderGraph(data);
            })
            .catch(error => {
                console.error('Ошибка при загрузке данных графа:', error);
                const graphContainer = document.getElementById('graph-container');
                if (graphContainer) {
                    graphContainer.innerHTML = '<p>Произошла ошибка при загрузке данных графа.</p>';
                }
            });
    }
});

function renderGraph(graph) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const zoomBehavior = d3.zoom().on("zoom", (event) => {
        svgGroup.attr("transform", event.transform);
    });

    const svg = d3.select("#graph").append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(zoomBehavior); // возможность зумирования

    const svgGroup = svg.append("g");

    const mainUserId = graph.nodes[0].id;

    const linkForce = d3.forceLink(graph.links)
        .id(d => d.id)
        .distance(400); // Увеличили расстояние между узлами

    const simulation = d3.forceSimulation(graph.nodes)
        .force("link", linkForce)
        .force("charge", d3.forceManyBody().strength(-1200)) // Сильнее отталкивание
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(80)) // Увеличен радиус столкновений
        .alphaDecay(0.03) // Чуть более медленное затухание, чтобы узлы лучше разлетелись
        .on("tick", ticked)
        .on("end", () => {
            // Когда симуляция завершилась, подгоним масштаб, чтобы весь граф влез на экран
            fitGraphToView();
        });

    const link = svgGroup.append("g")
        .attr("stroke", "#bbb")
        .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(graph.links)
      .enter().append("line")
        .attr("stroke-width", 1.5);

    const node = svgGroup.append("g")
        .selectAll("g")
        .data(graph.nodes)
        .enter().append("g")
        .attr("class", "node")
        .on("click", (event, d) => {
            if (selectedNode && selectedNode.id === d.id) {
                // Повторный клик - снять выделение
                resetHighlight(node, link);
                selectedNode = null;
            } else {
                // Новый выбор
                resetHighlight(node, link);

                d3.select(event.currentTarget).classed("highlighted-node", true);

                d3.select(event.currentTarget).select("text")
                    .text(`${d.first_name} ${d.last_name} (ID: ${d.id})`);

                const connectedLinks = graph.links.filter(l => l.source.id === d.id || l.target.id === d.id);

                connectedLinks.forEach(l => {
                    link.filter(dl => dl === l).classed("highlighted-link", true);

                    const connectedNodeId = (l.source.id === d.id) ? l.target.id : l.source.id;
                    node.filter(dn => dn.id === connectedNodeId).classed("highlighted-node", true);
                });

                selectedNode = d;
            }
        });

    node.append("circle")
        .attr("r", d => d.id === mainUserId ? 15 : 10)
        .attr("fill", d => d.id === mainUserId ? "#ff165d" : "#00b8a9")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);
    // Убрали вызов d3.drag(), чтобы нельзя было двигать узлы

    node.append("text")
        .text(d => `${d.first_name} ${d.last_name}`)
        .attr("x", 18)
        .attr("y", 5)
        .attr("font-size", "12px")
        .attr("fill", "#333")
        .attr("font-weight", "600");

    node.append("title")
        .text(d => `ID: ${d.id}\n${d.first_name} ${d.last_name}`);

    function ticked() {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("transform", d => `translate(${d.x},${d.y})`);
    }

    // Функция подгонки масштаба, чтобы граф целиком влез в окно
    function fitGraphToView() {
        const bounds = svgGroup.node().getBBox();
        const fullWidth = window.innerWidth;
        const fullHeight = window.innerHeight;

        const dx = bounds.width;
        const dy = bounds.height;
        const x = bounds.x + dx / 2;
        const y = bounds.y + dy / 2;
        const scale = Math.min(0.9 * fullWidth / dx, 0.9 * fullHeight / dy);
        const transform = d3.zoomIdentity
            .translate(fullWidth / 2, fullHeight / 2)
            .scale(scale)
            .translate(-x, -y);

        svg.transition()
            .duration(500)
            .call(zoomBehavior.transform, transform);
    }
}

function resetHighlight(node, link) {
    node.classed("highlighted-node", false);
    link.classed("highlighted-link", false);
    node.select("text").text(d => `${d.first_name} ${d.last_name}`);
}
