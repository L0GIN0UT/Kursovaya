# src/main.py

import vk_api
import networkx as nx
import json
import time
from src.config import ACCESS_TOKEN


def get_friends_data(vk, user_id):
    friends = vk.friends.get(user_id=user_id, fields="nickname,domain,first_name,last_name,deactivated")
    return friends


def build_graph(vk, user_id):
    G = nx.Graph()

    # Получаем информацию о пользователе
    user_info = vk.users.get(user_ids=user_id, fields="first_name,last_name")[0]
    main_user_node = {
        "id": user_info["id"],
        "first_name": user_info["first_name"],
        "last_name": user_info["last_name"]
    }
    G.add_node(user_info["id"], **main_user_node)

    # Получаем список друзей
    friends = get_friends_data(vk, user_id)
    friend_items = friends["items"]

    # Добавляем друзей как узлы
    for f in friend_items:
        G.add_node(f["id"], first_name=f.get("first_name", ""), last_name=f.get("last_name", ""),
                   deactivated=f.get("deactivated", ""))

    # Получаем связи между друзьями (ограничимся 50 для избежания превышения лимитов)
    friend_ids = [f["id"] for f in friend_items if f.get("deactivated") != "deleted"]
    friend_limit = 50
    subset_friend_ids = friend_ids[:friend_limit]

    # Добавляем ребра от главного пользователя ко всем друзьям
    for fid in friend_ids:
        G.add_edge(user_info["id"], fid)

    # Проверяем связи между друзьями
    for fid in subset_friend_ids:
        # Немного задержки между запросами, чтобы не превысить лимиты
        time.sleep(0.4)
        try:
            f_friends = vk.friends.get(user_id=fid)["items"]
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
            "deactivated": data.get("deactivated", "")
        }
        nodes.append(node_data)

    links = []
    for source, target in G.edges():
        links.append({"source": source, "target": target})

    graph_data = {"nodes": nodes, "links": links}

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(graph_data, f, ensure_ascii=False, indent=2)
