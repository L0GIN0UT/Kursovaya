# src/server/app.py

from flask import Flask, send_from_directory, request, redirect, url_for, jsonify
import os
import vk_api
import networkx as nx
import json
import time
from src.config import ACCESS_TOKEN
from src.main import build_graph, export_graph_to_json

app = Flask(__name__, static_folder="../client", static_url_path='')

@app.route('/')
def index():
    # Отдаем стартовую страницу
    return send_from_directory("../client", "index.html")

@app.route('/build_graph', methods=['POST'])
def build_graph_route():
    user_id = request.form.get('user_id')
    if not user_id:
        return jsonify({"error": "Не указан user_id"}), 400

    try:
        user_id = int(user_id)
    except ValueError:
        return jsonify({"error": "Некорректный user_id"}), 400

    # Инициализация VK API
    vk_session = vk_api.VkApi(token=ACCESS_TOKEN)
    vk = vk_session.get_api()

    try:
        # Собираем граф по указанному user_id
        G = build_graph(vk, user_id)

        # Экспортируем в JSON
        data_path = os.path.join(os.path.dirname(__file__), '../data/graph_data.json')
        export_graph_to_json(G, data_path)

    except vk_api.exceptions.ApiError as e:
        return jsonify({"error": f"Ошибка при сборе данных: {str(e)}"}), 500

    # Возвращаем успешный ответ
    return jsonify({"success": True}), 200

@app.route('/graph')
def graph_page():
    return send_from_directory("../client", "graph.html")

@app.route('/data/graph_data.json')
def get_graph_data():
    return send_from_directory("../data", "graph_data.json")

if __name__ == '__main__':
    app.run(debug=True)
