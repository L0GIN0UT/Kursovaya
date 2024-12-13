import vk_api
import networkx as nx
import json
import time
from src.config import ACCESS_TOKEN


def get_friends_data(vk, user_id):
    # Запрашиваем дополнительные поля: photo_200 (фото), gender (пол), bdate (дата рождения), mobile_phone (номер телефона), email (почта)
    fields = "photo_200,gender,bdate,mobile_phone,email"
    friends = vk.friends.get(user_id=user_id, fields=fields)
    return friends


def build_graph(vk, user_id):
    G = nx.Graph()

    # Получаем информацию о пользователе с дополнительными полями
    user_info = vk.users.get(user_ids=user_id, fields="photo_200,gender,bdate,mobile_phone,email")[0]
    main_user_node = {
        "id": user_info["id"],
        "first_name": user_info.get("first_name", ""),
        "last_name": user_info.get("last_name", ""),
        "photo_200": user_info.get("photo_200", ""),
        "gender": user_info.get("gender", 0),
        "bdate": user_info.get("bdate", ""),
    }
    G.add_node(user_info["id"], **main_user_node)

    # Получаем список друзей с дополнительными полями
    friends = get_friends_data(vk, user_id)
    friend_items = friends["items"]

    # Добавляем друзей как узлы с дополнительными данными
    for f in friend_items:
        friend_node = {
            "id": f["id"],
            "first_name": f.get("first_name", ""),
            "last_name": f.get("last_name", ""),
            "photo_200": f.get("photo_200", ""),
            "gender": f.get("gender", 0),
            "bdate": f.get("bdate", ""),
            "deactivated": f.get("deactivated", "")
        }
        G.add_node(f["id"], **friend_node)

    # Получаем связи между друзьями (ограничимся 50 для избежания превышения лимитов)
    friend_ids = [f["id"] for f in friend_items if f.get("deactivated") != "deleted"]
    friend_limit = 50
    subset_friend_ids = friend_ids[:friend_limit]

    # Добавляем рёбра от главного пользователя ко всем друзьям
    for fid in friend_ids:
        G.add_edge(user_info["id"], fid)

    # Проверяем связи между друзьями
    for fid in subset_friend_ids:
        # Немного задержки между запросами, чтобы не превысить лимиты
        time.sleep(0.4)
        try:
            # Запрашиваем друзей текущего друга с дополнительными полями
            f_friends = vk.friends.get(user_id=fid, fields="")["items"]  # Дополнительные поля здесь не нужны
            # Пересекаем список друзей fid с нашими friend_ids, чтобы найти взаимосвязи
            common = set(friend_ids).intersection(f_friends)
            for cf in common:
                if fid != cf:
                    G.add_edge(fid, cf)
        except vk_api.exceptions.ApiError as e:
            print(f"Error fetching friends of {fid}: {e}")

    return G


def export_graph_to_json(G, filepath):
    nodes = []
    for n, data in G.nodes(data=True):
        node_data = {
            "id": n,
            "first_name": data.get("first_name", ""),
            "last_name": data.get("last_name", ""),
            "photo_200": data.get("photo_200", ""),
            "gender": data.get("gender", 0),
            "bdate": data.get("bdate", ""),
            "deactivated": data.get("deactivated", "")
        }
        nodes.append(node_data)

    links = []
    for source, target in G.edges():
        links.append({"source": source, "target": target})

    graph_data = {"nodes": nodes, "links": links}

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(graph_data, f, ensure_ascii=False, indent=2)