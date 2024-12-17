let selectedNode = null;

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('user-form');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');

    // Обработка отправки формы
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

    // Загружаем граф
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
                // Фильтруем связи
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

// Функция отрисовки графа
function renderGraph(graph) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    const zoomBehavior = d3.zoom().on("zoom", (event) => {
        svgGroup.attr("transform", event.transform);
    });

    const svg = d3.select("#graph").append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(zoomBehavior);

    const svgGroup = svg.append("g");

    const linkForce = d3.forceLink(graph.links)
        .id(d => d.id)
        .distance(400);

    const simulation = d3.forceSimulation(graph.nodes)
        .force("link", linkForce)
        .force("charge", d3.forceManyBody().strength(-1200))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(80))
        .alphaDecay(0.03)
        .on("tick", ticked)
        .on("end", () => {
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
                resetHighlight(node, link);
                selectedNode = null;
                closePopup();
            } else {
                resetHighlight(node, link);
                d3.select(event.currentTarget).classed("highlighted-node", true);

                const connectedLinks = graph.links.filter(l => l.source.id === d.id || l.target.id === d.id);
                connectedLinks.forEach(l => {
                    link.filter(dl => dl === l).classed("highlighted-link", true);

                    const connectedNodeId = (l.source.id === d.id) ? l.target.id : l.source.id;
                    node.filter(dn => dn.id === connectedNodeId).classed("highlighted-node", true);
                });

                node.classed("dimmed", true); // Затемняем остальные узлы
                link.classed("dimmed", true); // Затемняем остальные связи
                d3.select(event.currentTarget).classed("highlighted-node", true); // Подсвечиваем выбранный узел
                selectedNode = d;
                showPopup(d);
            }
        });

    // Добавление аватарок в узлы
    node.append("image")
        .attr("xlink:href", d => d.photo_200)
        .attr("x", -25)
        .attr("y", -25)
        .attr("width", 50)
        .attr("height", 50)
        .attr("clip-path", "circle(50%)");

    node.append("text")
        .text(d => `${d.first_name} ${d.last_name}`)
        .attr("x", -50)
        .attr("y", 35)
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

// Функция для показа POP-UP
function showPopup(user) {
    const overlay = document.getElementById("overlay");
    const popup = document.getElementById("popup");
    const userAvatar = document.getElementById("user-avatar");
    const userName = document.getElementById("user-name");
    const userBdate = document.getElementById("user-bdate");
    const userGender = document.getElementById("user-gender");

    userAvatar.src = user.photo_200;
    userName.textContent = `${user.first_name} ${user.last_name}`;
    userBdate.textContent = formatDate(user.bdate) || "Не указано";
    userGender.textContent = user.gender === 1 ? "Женский" : user.gender === 2 ? "Мужской" : "Не указан";

    overlay.style.display = "block";
    popup.style.display = "block";
}

// Функция для закрытия POP-UP
function closePopup() {
    const overlay = document.getElementById("overlay");
    const popup = document.getElementById("popup");
    overlay.style.display = "none";
    popup.style.display = "none";
    resetHighlight(d3.selectAll('.node'), d3.selectAll('line'));
}

// Закрытие POP-UP при клике на крестик или за его пределами
document.getElementById("close-popup").addEventListener("click", closePopup);
window.addEventListener("click", (event) => {
    const popup = document.getElementById("popup");
    const overlay = document.getElementById("overlay");
    if (event.target === overlay) {
        closePopup();
    }
});

// Функция для подсветки
function resetHighlight(nodes, links) {
    nodes.classed("highlighted-node", false).classed("dimmed", false);
    links.classed("highlighted-link", false).classed("dimmed", false);
}

// Функция для форматирования даты
function formatDate(dateString) {
    if (!dateString) return "";
    const dateParts = dateString.split(".");
    if (dateParts.length === 1) return dateParts[0]; // Если только день и месяц
    if (dateParts.length === 3) return `${dateParts[0]}.${dateParts[1]}.${dateParts[2]}`; // ДД.ММ.ГГГГ
    return dateString; // На случай если дата не соответствует формату
}